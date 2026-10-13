import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: {
    signup: vi.fn(),
    issuePasswordReset: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

// Redis (memory store) serves every bucket, so any DB use is a bug: fail loudly.
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: () => { throw new Error('unexpected prisma use'); } }),
}));
vi.mock('@/server/auth/auth.service', () => ({ authService: m.auth }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { RateLimitedError } = await import('@/server/common/rate-limit');
  return {
    jsonError: (err: unknown) =>
      err instanceof RateLimitedError
        ? NextResponse.json({}, { status: 429, headers: { 'Retry-After': String(err.retryAfter) } })
        : NextResponse.json({ message: String(err) }, { status: 500 }),
  };
});

import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as forgot } from '@/app/api/auth/forgot/route';
import { POST as reset } from '@/app/api/auth/reset/route';
import { __resetCacheStateForTests, memoryStore, setStoreForTests } from '@/server/common/cache';

const post = (url: string, body: unknown, ip = '1.1.1.1') =>
  new Request(`http://t${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1`, 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheStateForTests();
  setStoreForTests(memoryStore());
  m.auth.signup.mockResolvedValue({ id: 'u1' });
  m.auth.issuePasswordReset.mockResolvedValue({});
  m.auth.resetPassword.mockResolvedValue(undefined);
});

describe('auth route rate limits (per IP)', () => {
  it('signup: 6th call per 15 min is 429 with Retry-After; other IP fine', async () => {
    const b = { name: 'Test User', email: 'a@example.com', password: 'password123' };
    for (let i = 0; i < 5; i++) expect((await signup(post('/api/auth/signup', b))).status).toBe(201);
    const res = await signup(post('/api/auth/signup', b));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(m.auth.signup).toHaveBeenCalledTimes(5);
    expect((await signup(post('/api/auth/signup', b, '2.2.2.2'))).status).toBe(201);
  });

  it('forgot: 6th call per hour is 429', async () => {
    const b = { email: 'a@example.com' };
    for (let i = 0; i < 5; i++) expect((await forgot(post('/api/auth/forgot', b))).status).toBe(200);
    expect((await forgot(post('/api/auth/forgot', b))).status).toBe(429);
    expect(m.auth.issuePasswordReset).toHaveBeenCalledTimes(5);
  });

  it('reset: 11th call per hour is 429', async () => {
    const b = { token: 't'.repeat(32), password: 'password123' };
    for (let i = 0; i < 10; i++) expect((await reset(post('/api/auth/reset', b))).status).toBe(200);
    expect((await reset(post('/api/auth/reset', b))).status).toBe(429);
    expect(m.auth.resetPassword).toHaveBeenCalledTimes(10);
  });
});
