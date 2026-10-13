import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';

export const subscriptionCreateSchema = z.object({ plan: z.enum(SubscriptionPlan) }).strict();
export type SubscriptionCreateInput = z.infer<typeof subscriptionCreateSchema>;

export const PLAN_MONTHS: Record<SubscriptionPlan, number> = {
  MONTH_1: 1,
  MONTH_3: 3,
  MONTH_6: 6,
  MONTH_12: 12,
};

/** Wire shape (dates are ISO strings after JSON serialisation). */
export const subscriptionSchema = z.object({
  id: z.string(),
  plan: z.enum(SubscriptionPlan),
  status: z.enum(SubscriptionStatus),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  activatedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type SubscriptionDTO = z.infer<typeof subscriptionSchema>;

export const SUBSCRIPTION_STATES = ['NONE', 'PENDING', 'ACTIVE', 'EXPIRED'] as const;
export type SubscriptionStateName = (typeof SUBSCRIPTION_STATES)[number];

export const subscriptionStateSchema = z.object({
  state: z.enum(SUBSCRIPTION_STATES),
  /** End of the current active period (including stacked periods); null unless ACTIVE. */
  activeUntil: z.iso.datetime().nullable(),
  /** The open plan request, if any (can coexist with ACTIVE). */
  pending: subscriptionSchema.nullable(),
});
export type SubscriptionStateDTO = z.infer<typeof subscriptionStateSchema>;
