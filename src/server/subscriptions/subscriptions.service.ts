import { Prisma, type SubscriptionPlan } from '@prisma/client';

import { PLAN_MONTHS, type SubscriptionStateName } from '@/contracts/subscriptions';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, SubscriptionRequiredError } from '@/server/common/errors';

export const subscriptionSelect = {
  id: true,
  plan: true,
  status: true,
  startsAt: true,
  endsAt: true,
  activatedAt: true,
  createdAt: true,
} satisfies Prisma.SubscriptionSelect;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

export interface SubscriptionState {
  state: SubscriptionStateName;
  activeUntil: Date | null;
  pending: SubscriptionRow | null;
}

/** Pure state rule over all of a user's rows (shared by getState and the admin list). */
export function subscriptionStateFrom(rows: SubscriptionRow[], now: Date): SubscriptionState {
  const active = rows.filter((r) => r.status === 'ACTIVE' && r.startsAt && r.endsAt);
  const pending = rows.find((r) => r.status === 'PENDING') ?? null;
  const isActive = active.some((r) => r.startsAt! <= now && r.endsAt! > now);
  // Stacked periods are contiguous, so the latest end is when access runs out.
  const activeUntil = isActive ? new Date(Math.max(...active.map((r) => r.endsAt!.getTime()))) : null;
  const state = isActive ? 'ACTIVE' : pending ? 'PENDING' : active.length ? 'EXPIRED' : 'NONE';
  return { state, activeUntil, pending };
}

/** Calendar months in UTC; the day clamps to the target month's last day (Jan 31 + 1 = Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

export const subscriptionsService = {
  async requestPlan(userId: string, plan: SubscriptionPlan) {
    // No pre-check: the partial unique index "Subscription_one_pending_per_user" is the
    // single source of truth, so concurrent requests can't both slip through.
    try {
      return await prisma.subscription.create({ data: { userId, plan }, select: subscriptionSelect });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('A plan request is already awaiting activation (SUBSCRIPTION_PENDING)');
      }
      throw err;
    }
  },

  async getState(userId: string, now = new Date()): Promise<SubscriptionState> {
    const rows = await prisma.subscription.findMany({ where: { userId }, select: subscriptionSelect });
    return subscriptionStateFrom(rows, now);
  },

  async assertActive(userId: string, now = new Date()): Promise<void> {
    const { state } = await subscriptionsService.getState(userId, now);
    if (state !== 'ACTIVE') throw new SubscriptionRequiredError();
  },

  /** Read-only access to issued records: ACTIVE, or EXPIRED (had a plan once, none now). */
  async assertReadable(userId: string, now = new Date()): Promise<void> {
    const { state } = await subscriptionsService.getState(userId, now);
    if (state !== 'ACTIVE' && state !== 'EXPIRED') throw new SubscriptionRequiredError();
  },

  /** Admin overview: USER accounts, open requests, users with a current active period. */
  async counts(now = new Date()) {
    const [users, pending, active] = await Promise.all([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.subscription.count({ where: { status: 'PENDING' } }),
      prisma.user.count({
        where: { subscriptions: { some: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } } } },
      }),
    ]);
    return { users, pending, active };
  },

  activate(subscriptionId: string, adminId: string, now = new Date()) {
    return prisma.$transaction(async (tx) => {
      // Row lock: two admins activating the same request serialise here.
      const [sub] = await tx.$queryRaw<{ userId: string; plan: SubscriptionPlan; status: string }[]>`
        SELECT "userId", "plan", "status" FROM "Subscription" WHERE "id" = ${subscriptionId} FOR UPDATE`;
      if (!sub) throw new NotFoundError('Subscription');
      if (sub.status !== 'PENDING') {
        throw new ConflictError('Subscription is not pending (SUBSCRIPTION_NOT_PENDING)');
      }
      const { _max } = await tx.subscription.aggregate({
        where: { userId: sub.userId, status: 'ACTIVE' },
        _max: { endsAt: true },
      });
      const startsAt = _max.endsAt && _max.endsAt > now ? _max.endsAt : now;
      return tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: 'ACTIVE',
          startsAt,
          endsAt: addMonths(startsAt, PLAN_MONTHS[sub.plan]),
          activatedAt: now,
          activatedById: adminId,
        },
        select: subscriptionSelect,
      });
    });
  },
};
