import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the RateLimitBucket table so the real limiter logic runs.
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
      },
    },
  };
});
const ip = vi.hoisted(() => ({ value: '1.1.1.1' }));
const auth = vi.hoisted(() => ({
  signup: vi.fn(),
  issuePasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/auth', () => ({ signOut: vi.fn() }));
vi.mock('@/server/auth/auth.service', () => ({ authService: auth }));
vi.mock('@/server/common/http', () => ({ requireSession: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': `${ip.value}, 10.0.0.1` }),
}));

import { setStoreForTests } from '@/server/common/cache';
import { forgotPasswordAction, resetPasswordAction, signupAction } from '@/modules/auth/actions';

const signupInput = { name: 'Test User', email: 'a@b.co', password: 'Passw0rd!long' };
const forgotInput = { email: 'a@b.co' };
const resetInput = { token: 't'.repeat(40), password: 'Passw0rd!long' };

// Exercise the Postgres path above, never a real Upstash store from .env.dev.
beforeEach(() => {
  setStoreForTests(null);
  db.buckets.clear();
  ip.value = '1.1.1.1';
  vi.clearAllMocks();
  auth.signup.mockResolvedValue({});
  auth.issuePasswordReset.mockResolvedValue({});
  auth.resetPassword.mockResolvedValue(undefined);
});

afterEach(() => setStoreForTests(undefined));

describe('auth server actions are rate limited per IP', () => {
  it('signup: 6th call is refused before any user is created; other IP unaffected', async () => {
    for (let i = 0; i < 5; i++) expect((await signupAction(signupInput)).ok).toBe(true);
    const sixth = await signupAction(signupInput);
    expect(sixth.ok).toBe(false);
    expect(sixth.message).toMatch(/too many/i);
    expect(auth.signup).toHaveBeenCalledTimes(5);
    ip.value = '2.2.2.2';
    expect((await signupAction(signupInput)).ok).toBe(true);
  });

  it('forgot: 6th call sends no email', async () => {
    for (let i = 0; i < 5; i++) await forgotPasswordAction(forgotInput);
    const sixth = await forgotPasswordAction(forgotInput);
    expect(sixth.ok).toBe(false);
    expect(auth.issuePasswordReset).toHaveBeenCalledTimes(5);
  });

  it('reset: 11th call is refused', async () => {
    for (let i = 0; i < 10; i++) expect((await resetPasswordAction(resetInput)).ok).toBe(true);
    const eleventh = await resetPasswordAction(resetInput);
    expect(eleventh.ok).toBe(false);
    expect(auth.resetPassword).toHaveBeenCalledTimes(10);
  });
});
