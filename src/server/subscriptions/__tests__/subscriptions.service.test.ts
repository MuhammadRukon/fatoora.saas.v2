/**
 * DB-backed (real prisma via DATABASE_URL). Each test creates its own
 * users; afterEach deletes them, which cascades their Subscription rows.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, SubscriptionRequiredError } from '@/server/common/errors';

import { addMonths, subscriptionsService } from '../subscriptions.service';

const userIds: string[] = [];
async function freshUser(role: 'USER' | 'ADMIN' = 'USER') {
  const user = await prisma.user.create({
    data: { name: 'Sub Test', email: `sub-${Math.random()}@example.test`, role },
  });
  userIds.push(user.id);
  return user.id;
}

afterEach(async () => {
  const ids = userIds.splice(0);
  // Subscriptions first: activatedById points at the admin without cascade.
  await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

describe('subscriptionsService.requestPlan', () => {
  it('creates a PENDING request with no dates', async () => {
    const userId = await freshUser();
    const sub = await subscriptionsService.requestPlan(userId, 'MONTH_3');
    expect(sub).toMatchObject({ status: 'PENDING', plan: 'MONTH_3', startsAt: null, endsAt: null });
  });

  it('rejects a second request while one is PENDING', async () => {
    const userId = await freshUser();
    await subscriptionsService.requestPlan(userId, 'MONTH_3');
    const err = await subscriptionsService.requestPlan(userId, 'MONTH_12').catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('SUBSCRIPTION_PENDING');
    expect(await prisma.subscription.count({ where: { userId, status: 'PENDING' } })).toBe(1);
  });

  it('keeps exactly one PENDING row under concurrent requests', async () => {
    const userId = await freshUser();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => subscriptionsService.requestPlan(userId, 'MONTH_1')),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((r) => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }
    expect(await prisma.subscription.count({ where: { userId } })).toBe(1);
  });
});

describe('addMonths', () => {
  it('adds calendar months in UTC, clamped to the month end', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1)).toEqual(new Date('2026-02-28T10:00:00Z'));
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1)).toEqual(new Date('2028-02-29T00:00:00Z'));
    expect(addMonths(new Date('2026-08-31T23:30:00Z'), 3)).toEqual(new Date('2026-11-30T23:30:00Z'));
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 12)).toEqual(new Date('2027-11-15T00:00:00Z'));
  });
});

describe('subscriptionsService.activate', () => {
  it('activates a first MONTH_1 request from now, clamped to month end', async () => {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    const { id } = await subscriptionsService.requestPlan(userId, 'MONTH_1');
    const now = new Date('2026-01-31T10:00:00Z');

    const sub = await subscriptionsService.activate(id, adminId, now);

    expect(sub).toMatchObject({
      status: 'ACTIVE',
      startsAt: new Date('2026-01-31T10:00:00Z'),
      endsAt: new Date('2026-02-28T10:00:00Z'),
      activatedAt: now,
    });
  });

  it('stacks a new period after the current one ends', async () => {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    const first = await subscriptionsService.requestPlan(userId, 'MONTH_3');
    await subscriptionsService.activate(first.id, adminId, new Date('2026-03-01T00:00:00Z'));
    const next = await subscriptionsService.requestPlan(userId, 'MONTH_6');

    const sub = await subscriptionsService.activate(next.id, adminId, new Date('2026-05-01T00:00:00Z'));

    expect(sub.startsAt).toEqual(new Date('2026-06-01T00:00:00Z'));
    expect(sub.endsAt).toEqual(new Date('2026-12-01T00:00:00Z'));
  });

  it('starts from now when the previous period already ended', async () => {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    const first = await subscriptionsService.requestPlan(userId, 'MONTH_1');
    await subscriptionsService.activate(first.id, adminId, new Date('2026-01-01T00:00:00Z'));
    const next = await subscriptionsService.requestPlan(userId, 'MONTH_1');

    const sub = await subscriptionsService.activate(next.id, adminId, new Date('2026-04-10T00:00:00Z'));

    expect(sub.startsAt).toEqual(new Date('2026-04-10T00:00:00Z'));
  });

  it('rejects activating a non-PENDING subscription', async () => {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    const { id } = await subscriptionsService.requestPlan(userId, 'MONTH_1');
    await subscriptionsService.activate(id, adminId);
    const err = await subscriptionsService.activate(id, adminId).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('SUBSCRIPTION_NOT_PENDING');
  });

  it('throws NotFoundError for an unknown id', async () => {
    const adminId = await freshUser('ADMIN');
    await expect(subscriptionsService.activate('nope', adminId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('subscriptionsService.getState', () => {
  const t0 = new Date('2026-03-01T00:00:00Z');

  async function activeUser() {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    const { id } = await subscriptionsService.requestPlan(userId, 'MONTH_1');
    await subscriptionsService.activate(id, adminId, t0); // active until 2026-04-01
    return userId;
  }

  it('is NONE with no rows', async () => {
    const userId = await freshUser();
    expect(await subscriptionsService.getState(userId, t0)).toEqual({
      state: 'NONE',
      activeUntil: null,
      pending: null,
    });
  });

  it('is PENDING with only a pending request', async () => {
    const userId = await freshUser();
    const req = await subscriptionsService.requestPlan(userId, 'MONTH_6');
    const state = await subscriptionsService.getState(userId, t0);
    expect(state).toMatchObject({ state: 'PENDING', activeUntil: null, pending: { id: req.id, plan: 'MONTH_6' } });
  });

  it('is ACTIVE when startsAt <= now < endsAt', async () => {
    const userId = await activeUser();
    expect(await subscriptionsService.getState(userId, t0)).toMatchObject({
      state: 'ACTIVE',
      activeUntil: new Date('2026-04-01T00:00:00Z'),
    });
    expect((await subscriptionsService.getState(userId, new Date('2026-03-31T23:59:59Z'))).state).toBe('ACTIVE');
  });

  it('is EXPIRED when now >= endsAt and no other row is active', async () => {
    const userId = await activeUser();
    expect((await subscriptionsService.getState(userId, new Date('2026-04-01T00:00:00Z'))).state).toBe(
      'EXPIRED',
    );
  });

  it('reports the end of stacked periods as activeUntil', async () => {
    const userId = await activeUser();
    const adminId = await freshUser('ADMIN');
    const next = await subscriptionsService.requestPlan(userId, 'MONTH_3');
    await subscriptionsService.activate(next.id, adminId, new Date('2026-03-10T00:00:00Z'));
    expect((await subscriptionsService.getState(userId, t0)).activeUntil).toEqual(new Date('2026-07-01T00:00:00Z'));
  });
});

describe('subscriptionsService.assertActive', () => {
  it('throws SubscriptionRequiredError unless ACTIVE', async () => {
    const userId = await freshUser();
    const adminId = await freshUser('ADMIN');
    await expect(subscriptionsService.assertActive(userId)).rejects.toBeInstanceOf(SubscriptionRequiredError);
    const { id } = await subscriptionsService.requestPlan(userId, 'MONTH_1');
    await expect(subscriptionsService.assertActive(userId)).rejects.toBeInstanceOf(SubscriptionRequiredError);
    await subscriptionsService.activate(id, adminId);
    await expect(subscriptionsService.assertActive(userId)).resolves.toBeUndefined();
  });
});
