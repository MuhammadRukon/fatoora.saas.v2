import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetCacheStateForTests,
  buildKey,
  cacheDel,
  cached,
  getStore,
  memoryStore,
  setDefer,
  setStoreForTests,
  stableHash,
  upstashStore,
  type CacheStore,
} from '../cache';

beforeEach(() => {
  vi.useFakeTimers();
  __resetCacheStateForTests();
  setStoreForTests(null);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setStoreForTests(undefined);
  setDefer(undefined);
});

const opts = { key: 'k', ttlSec: 60, jitter: 0 };

describe('no store (env unset)', () => {
  it('getStore is null and cached runs the loader every call', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    setStoreForTests(undefined);
    expect(getStore()).toBeNull();
    const loader = vi.fn(async () => 1);
    for (let i = 0; i < 3; i++) expect(await cached(opts, loader)).toBe(1);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});

describe('next build phase', () => {
  it('getStore is null during the production build unless a test store is injected', () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://x.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 't');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    setStoreForTests(undefined);
    expect(getStore()).toBeNull();
    const injected = memoryStore();
    setStoreForTests(injected);
    expect(getStore()).toBe(injected);
  });
});

describe('cached with memoryStore', () => {
  beforeEach(() => setStoreForTests(memoryStore()));

  it('hits within TTL, reloads after', async () => {
    const loader = vi.fn(async () => ({ a: 1 }));
    expect(await cached(opts, loader)).toEqual({ a: 1 });
    expect(await cached(opts, loader)).toEqual({ a: 1 });
    expect(loader).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await cached(opts, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('dedupes concurrent cold calls', async () => {
    const loader = vi.fn(async () => 'v');
    const out = await Promise.all(Array.from({ length: 10 }, () => cached(opts, loader)));
    expect(out.every((v) => v === 'v')).toBe(true);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('applies +/- jitter to the ttl', async () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    setStoreForTests(store);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    await cached({ key: 'j', ttlSec: 100, jitter: 0.1 }, async () => 1);
    expect(set).toHaveBeenCalledWith('j', 1, 110);
  });

  it('ttlFor overrides ttlSec using the loaded value', async () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    setStoreForTests(store);
    await cached(
      { key: 't', ttlSec: 100, jitter: 0, ttlFor: (v: number[]) => (v.length ? 60 : 30) },
      async () => [] as number[],
    );
    expect(set).toHaveBeenCalledWith('t', [], 30);
  });

  it('skips set for payloads over 100KB but still returns them', async () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    setStoreForTests(store);
    const big = 'x'.repeat(100 * 1024 - 2 + 1); // JSON adds 2 quotes -> 102401 bytes
    expect(await cached(opts, async () => big)).toBe(big);
    expect(set).not.toHaveBeenCalled();
    const ok = 'x'.repeat(100 * 1024 - 2);
    await cached({ ...opts, key: 'ok' }, async () => ok);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('cacheDel removes entries', async () => {
    const loader = vi.fn(async () => 1);
    await cached(opts, loader);
    await cacheDel('k');
    await cached(opts, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('fail-open and circuit breaker', () => {
  const failing = () => {
    const s = memoryStore();
    s.get = vi.fn(async () => {
      throw new Error('down');
    }) as CacheStore['get'];
    return s;
  };

  it('returns loader value, trips after 5 failures, retries after 30s', async () => {
    const store = failing();
    setStoreForTests(store);
    const loader = vi.fn(async () => 'v');
    for (let i = 0; i < 5; i++) expect(await cached(opts, loader)).toBe('v');
    expect(store.get).toHaveBeenCalledTimes(5);
    expect(await cached(opts, loader)).toBe('v');
    expect(store.get).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(30_001);
    await cached(opts, loader);
    expect(store.get).toHaveBeenCalledTimes(6);
  });

  it('a success resets the failure counter', async () => {
    const store = memoryStore();
    const realGet = store.get.bind(store);
    let fail = true;
    store.get = (async (k: string) => {
      if (fail) throw new Error('x');
      return realGet(k);
    }) as CacheStore['get'];
    setStoreForTests(store);
    for (let i = 0; i < 4; i++) await cached({ ...opts, key: 'a' + i }, async () => 1);
    fail = false;
    await cached({ ...opts, key: 'ok' }, async () => 1);
    fail = true;
    for (let i = 0; i < 4; i++) await cached({ ...opts, key: 'b' + i }, async () => 1);
    fail = false;
    const spy = vi.spyOn(store, 'get');
    await cached({ ...opts, key: 'c' }, async () => 1);
    expect(spy).toHaveBeenCalled(); // breaker not open: 4+reset+4 < 5 consecutive
  });

  it('cacheDel never throws', async () => {
    const s = memoryStore();
    s.del = vi.fn(async () => {
      throw new Error('x');
    });
    setStoreForTests(s);
    await expect(cacheDel('a')).resolves.toBeUndefined();
  });
});

describe('deferred store writes', () => {
  const setup = () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set');
    setStoreForTests(store);
    return set;
  };

  it('returns the loader value before set; running the captured task sets once', async () => {
    const set = setup();
    const tasks: Array<() => Promise<unknown>> = [];
    setDefer((task) => void tasks.push(task));
    expect(await cached(opts, async () => 'v')).toBe('v');
    expect(set).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('k', 'v', 60);
  });

  it('falls back to an awaited set when defer is unset', async () => {
    const set = setup();
    expect(await cached(opts, async () => 'v')).toBe('v');
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('falls back to an awaited set when defer throws (outside a request scope)', async () => {
    const set = setup();
    setDefer(() => {
      throw new Error('`after` was called outside a request scope');
    });
    expect(await cached(opts, async () => 'v')).toBe('v');
    expect(set).toHaveBeenCalledTimes(1);
  });
});

describe('upstashStore', () => {
  it('times out a hung request after 250ms', async () => {
    const redis = { get: () => new Promise(() => {}) } as never;
    const p = upstashStore(redis).get('k');
    const assertion = expect(p).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(251);
    await assertion;
  });

  it('incrWindow is a single eval(script, [key], [windowMs])', async () => {
    const evalFn = vi.fn(async () => [3, 900]);
    const r = await upstashStore({ eval: evalFn } as never).incrWindow('k', 1000);
    expect(r).toEqual({ count: 3, pttlMs: 900 });
    expect(evalFn).toHaveBeenCalledTimes(1);
    const [script, keys, args] = evalFn.mock.calls[0] as unknown as [string, string[], unknown[]];
    expect(script).toMatch(/INCR/);
    expect(script).toMatch(/PEXPIRE/);
    expect(keys).toEqual(['k']);
    expect(args).toEqual([1000]);
  });
});

describe('memoryStore.incrWindow', () => {
  it('counts within window, pttl decreases, resets after', async () => {
    const s = memoryStore();
    const a = await s.incrWindow('r', 1000);
    vi.advanceTimersByTime(300);
    const b = await s.incrWindow('r', 1000);
    vi.advanceTimersByTime(300);
    const c = await s.incrWindow('r', 1000);
    expect([a.count, b.count, c.count]).toEqual([1, 2, 3]);
    expect(a.pttlMs).toBe(1000);
    expect(b.pttlMs).toBe(700);
    expect(c.pttlMs).toBe(400);
    vi.advanceTimersByTime(401);
    expect((await s.incrWindow('r', 1000)).count).toBe(1);
  });

  it('mget returns nulls for misses', async () => {
    const s = memoryStore();
    await s.set('a', { x: 1 }, 10);
    expect(await s.mget(['a', 'b'])).toEqual([{ x: 1 }, null]);
  });
});

describe('helpers', () => {
  it('stableHash ignores object key order only', () => {
    expect(stableHash({ a: 1, b: { c: 1, d: 2 } })).toBe(stableHash({ b: { d: 2, c: 1 }, a: 1 }));
    expect(stableHash({ a: 1, b: 2 })).not.toBe(stableHash({ a: 1, b: 3 }));
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  it('buildKey prefixes with env, read at call time', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(buildKey('cat', 'list')).toBe('gw:production:cat:list');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(buildKey('cat', 1)).toBe('gw:preview:cat:1');
  });

  it('buildKey never shares the production namespace with a local build', () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.VERCEL_ENV;
    expect(buildKey('a')).toBe('gw:local:a');
    vi.stubEnv('NODE_ENV', 'test');
    expect(buildKey('a')).toBe('gw:test:a');
  });
});
