import { createHash } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { getRedis } from '@/lib/redis';
import { log } from './logger';

export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  incrWindow(key: string, windowMs: number): Promise<{ count: number; pttlMs: number }>;
}

const TIMEOUT_MS = 250;
const MAX_PAYLOAD_BYTES = 100 * 1024;
const BREAKER_THRESHOLD = 5;
const BREAKER_OPEN_MS = 30_000;

const INCR_WINDOW_LUA = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}`;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`redis timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Adapter over Upstash REST. The client JSON-(de)serializes values itself. */
export function upstashStore(redis: Redis): CacheStore {
  return {
    get: <T>(key: string) => withTimeout(redis.get<T>(key)),
    set: async (key, value, ttlSec) => {
      await withTimeout(redis.set(key, value, { ex: ttlSec }));
    },
    del: async (...keys) => {
      if (keys.length) await withTimeout(redis.del(...keys));
    },
    mget: <T>(keys: string[]) =>
      keys.length ? withTimeout(redis.mget<(T | null)[]>(...keys)) : Promise.resolve([]),
    incrWindow: async (key, windowMs) => {
      const [count, pttl] = await withTimeout(
        redis.eval<[number], [number, number]>(INCR_WINDOW_LUA, [key], [windowMs]),
      );
      return { count, pttlMs: pttl };
    },
  };
}

/** Test store. Honors TTL via Date.now() so vi fake timers work. Values are kept as JSON like Redis. */
export function memoryStore(): CacheStore {
  const data = new Map<string, { json: string; expiresAt: number }>();
  const live = (key: string) => {
    const e = data.get(key);
    if (e && e.expiresAt <= Date.now()) data.delete(key);
    return data.get(key);
  };
  return {
    get: async <T>(key: string) => {
      const e = live(key);
      return e ? (JSON.parse(e.json) as T) : null;
    },
    set: async (key, value, ttlSec) => {
      data.set(key, { json: JSON.stringify(value), expiresAt: Date.now() + ttlSec * 1000 });
    },
    del: async (...keys) => {
      keys.forEach((k) => data.delete(k));
    },
    mget: async <T>(keys: string[]) =>
      keys.map((k) => {
        const e = live(k);
        return e ? (JSON.parse(e.json) as T) : null;
      }),
    incrWindow: async (key, windowMs) => {
      const e = live(key);
      const count = (e ? Number(e.json) : 0) + 1;
      const expiresAt = e ? e.expiresAt : Date.now() + windowMs; // window starts on first hit
      data.set(key, { json: String(count), expiresAt });
      return { count, pttlMs: expiresAt - Date.now() };
    },
  };
}

// undefined = use env; null = force "no store"; store = injected (tests only).
let override: CacheStore | null | undefined;
let singleton: CacheStore | null | undefined;

/** Test seam: inject a store (or null), or undefined to restore env-based resolution. */
export function setStoreForTests(store: CacheStore | null | undefined): void {
  override = store;
}

export function getStore(): CacheStore | null {
  if (override !== undefined) return override;
  if (process.env.NEXT_PHASE === 'phase-production-build') return null; // next build must not touch Redis
  const redis = getRedis();
  if (!redis) return null;
  return (singleton ??= upstashStore(redis));
}

// Circuit breaker, shared by every store call through withStore().
let failures = 0;
let openUntil = 0;
const inflight = new Map<string, Promise<unknown>>();

export function __resetCacheStateForTests(): void {
  failures = 0;
  openUntil = 0;
  inflight.clear();
}

/**
 * Run one store op fail-open: returns `{ ok: false }` on no store, open breaker, error or timeout.
 * After 5 consecutive failures the store is skipped for 30s, then retried (half-open).
 */
export async function withStore<T>(
  op: (s: CacheStore) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const store = getStore();
  if (!store || Date.now() < openUntil) return { ok: false };
  try {
    const value = await op(store);
    failures = 0;
    return { ok: true, value };
  } catch (err) {
    if (++failures >= BREAKER_THRESHOLD) openUntil = Date.now() + BREAKER_OPEN_MS;
    log.warn('cache store failure', {
      error: err instanceof Error ? err.message : String(err),
      failures,
    });
    return { ok: false };
  }
}

// Held on globalThis: instrumentation.ts injects it from its own module graph, which may not share this module instance.
const DEFER_KEY = Symbol.for('gw.cache.defer');
type Defer = (task: () => Promise<unknown>) => void;

/** Inject a post-response scheduler (Next `after`) from instrumentation.ts. undefined = await writes inline. */
export function setDefer(fn: Defer | undefined): void {
  (globalThis as { [DEFER_KEY]?: Defer })[DEFER_KEY] = fn;
}

/** Run a store write after the response when a scheduler is set; if it is unset or throws (no request scope), await it inline. */
export async function runDeferred(task: () => Promise<unknown>): Promise<void> {
  const defer = (globalThis as { [DEFER_KEY]?: Defer })[DEFER_KEY];
  if (defer) {
    try {
      defer(task);
      return;
    } catch {
      // outside a request scope (tests, build): fall through to the awaited write
    }
  }
  await task();
}

export async function cacheDel(...keys: string[]): Promise<void> {
  await withStore((s) => s.del(...keys));
}

export async function cached<T>(
  opts: {
    key: string;
    ttlSec: number;
    ttlFor?: (value: T) => number;
    jitter?: number;
  },
  loader: () => Promise<T>,
): Promise<T> {
  if (!getStore()) return loader();
  const pending = inflight.get(opts.key);
  if (pending) return pending as Promise<T>;
  // shortcut: in-flight dedupe is per instance, no cross-instance stampede lock; add one if cold-key load hurts.
  const run = (async () => {
    const hit = await withStore((s) => s.get<T>(opts.key));
    if (hit.ok && hit.value !== null) return hit.value;
    const value = await loader();
    if (!hit.ok) return value; // store is down/open: don't spend more calls on set
    const json = JSON.stringify(value);
    if (json !== undefined && Buffer.byteLength(json) <= MAX_PAYLOAD_BYTES) {
      const jitter = opts.jitter ?? 0.1;
      const rnd = Math.random();
      const ttl = Math.max(
        1,
        Math.round((opts.ttlFor?.(value) ?? opts.ttlSec) * (1 + (rnd * 2 - 1) * jitter)),
      );
      await runDeferred(() => withStore((s) => s.set(opts.key, value, ttl)));
    }
    return value;
  })().finally(() => inflight.delete(opts.key));
  inflight.set(opts.key, run);
  return run;
}

export function buildKey(...parts: (string | number)[]): string {
  const env = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === 'test' ? 'test' : 'local');
  return `gw:${env}:${parts.join(':')}`;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

export function stableHash(obj: unknown): string {
  return createHash('sha1')
    .update(JSON.stringify(sortKeys(obj)) ?? 'undefined')
    .digest('hex');
}
