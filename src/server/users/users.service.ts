import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  subscriptionSelect,
  subscriptionStateFrom,
  type SubscriptionState,
} from '@/server/subscriptions/subscriptions.service';

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  emailVerified: true,
  createdAt: true,
  subscriptions: { orderBy: { createdAt: 'desc' }, select: subscriptionSelect },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export type AdminUser = AdminUserRow & { subscriptionState: SubscriptionState };

export const usersService = {
  async listAdminUsers(now = new Date()): Promise<AdminUser[]> {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: adminUserSelect,
    });
    // State needs every row (an old ACTIVE row decides EXPIRED vs NONE); the payload keeps the latest 5.
    return users.map((u) => ({
      ...u,
      subscriptions: u.subscriptions.slice(0, 5),
      subscriptionState: subscriptionStateFrom(u.subscriptions, now),
    }));
  },
};
