import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the RateLimitBucket table (Postgres fallback path).
const db = vi.hoisted(() => {
  const buckets = new Map<string, { count: number; resetAt: Date }>();
  return {
    buckets,
    prisma: {
      rateLimitBucket: {
        updateMany: async ({ where }: { where: { key: string } }) => {
          const b = buckets.get(where.key);
          if (!b || b.resetAt <= new Date()) return { count: 0 };
          b.count += 1;
          return { count: 1 };
        },
        upsert: async ({ create }: { create: { key: string; count: number; resetAt: Date } }) => {
          buckets.set(create.key, { count: create.count, resetAt: create.resetAt });
        },
        findUniqueOrThrow: async ({ where }: { where: { key: string } }) => buckets.get(where.key)!,
        deleteMany: async ({ where }: { where: { key: string } }) => {
          buckets.delete(where.key);
        },
      },
    },
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));

import {
  __resetCacheStateForTests,
  memoryStore,
  setStoreForTests,
  type CacheStore,
} from '@/server/common/cache';
import {
  __memoryWindowsForTests,
  clearRateLimit,
  enforceRateLimit,
  RateLimitedError,
  rateLimit,
} from '@/server/common/rate-limit';

const policy = { max: 3, windowMs: 30_000 };

beforeEach(() => {
  db.buckets.clear();
  __memoryWindowsForTests.clear();
  __resetCacheStateForTests();
});
afterEach(() => {
  setStoreForTests(undefined);
  vi.useRealTimers();
});

describe('rateLimit on a Redis-like store', () => {
  it('counts per window, reports remaining/resetAt, and resets after the window', async () => {
    vi.useFakeTimers();
    setStoreForTests(memoryStore());
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await rateLimit('k', policy));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r.map((x) => x.remaining)).toEqual([2, 1, 0, 0]);
    expect(r[3].resetAt - Date.now()).toBeGreaterThan(0);
    expect(r[3].resetAt - Date.now()).toBeLessThanOrEqual(30_000);
    expect(db.buckets.size).toBe(0);
    vi.advanceTimersByTime(30_001);
    const next = await rateLimit('k', policy);
    expect(next.ok).toBe(true);
    expect(next.remaining).toBe(2);
  });

  it('never sends the raw key (email/IP) to the store', async () => {
    const seen: string[] = [];
    const base = memoryStore();
    setStoreForTests({ ...base, incrWindow: (k, w) => (seen.push(k), base.incrWindow(k, w)) });
    await rateLimit('login:1.2.3.4:a@b.com', policy);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain('@');
    expect(seen[0]).not.toContain('1.2.3.4');
    expect(seen[0]).toMatch(/^gw:[^:]+:rl:[0-9a-f]{32}$/);
  });

  it('clearRateLimit resets the Redis counter', async () => {
    setStoreForTests(memoryStore());
    await rateLimit('c', policy);
    await rateLimit('c', policy);
    await clearRateLimit('c');
    expect((await rateLimit('c', policy)).remaining).toBe(2);
  });
});

describe('store failure', () => {
  const broken: CacheStore = {
    ...memoryStore(),
    incrWindow: async () => {
      throw new Error('boom');
    },
  };

  it('default fallback uses Postgres logic and still limits', async () => {
    setStoreForTests(broken);
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await rateLimit('pg', policy));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(db.buckets.size).toBe(1);
  });

  it("fallback 'none' limits per instance in memory and never touches Postgres", async () => {
    vi.useFakeTimers();
    setStoreForTests(broken);
    const none = { fallback: 'none' as const };
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await rateLimit('open', policy, none));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r.map((x) => x.remaining)).toEqual([2, 1, 0, 0]);
    expect(db.buckets.size).toBe(0);
  });

  it("fallback 'none' with no store: 4th call throws RateLimitedError, window expiry frees it, keys are independent", async () => {
    vi.useFakeTimers();
    setStoreForTests(null);
    const none = { fallback: 'none' as const };
    for (let i = 0; i < 3; i++) await enforceRateLimit('w', policy, none);
    await expect(enforceRateLimit('w', policy, none)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(enforceRateLimit('other', policy, none)).resolves.toBeUndefined();
    vi.advanceTimersByTime(30_001);
    await expect(enforceRateLimit('w', policy, none)).resolves.toBeUndefined();
    expect(db.buckets.size).toBe(0);
  });

  it("fallback 'none' keeps at most 5000 keys", async () => {
    vi.useFakeTimers();
    setStoreForTests(null);
    const none = { fallback: 'none' as const };
    for (let i = 0; i < 5001; i++) await rateLimit(`cap:${i}`, policy, none);
    expect(__memoryWindowsForTests.size).toBeLessThanOrEqual(5000);
    // oldest key was dropped, so it starts a fresh window; the newest is still counted
    expect((await rateLimit('cap:0', policy, none)).remaining).toBe(2);
    expect((await rateLimit('cap:5000', policy, none)).remaining).toBe(1);
  });
});

describe('no store (unchanged Postgres behavior)', () => {
  it('limits via Postgres and clearRateLimit deletes the bucket', async () => {
    setStoreForTests(null);
    for (let i = 0; i < 3; i++) await rateLimit('n', policy);
    expect((await rateLimit('n', policy)).ok).toBe(false);
    await clearRateLimit('n');
    expect((await rateLimit('n', policy)).remaining).toBe(2);
  });
});
