import { CodFeeStatus } from '@prisma/client';

/**
 * COD confirmation fee lifecycle policy (pure, client-safe).
 *
 * The single place that says which fee status an admin action may start from
 * and where it ends up. Server services, the notice/view helpers and the UI
 * all derive their guards from this table instead of re-encoding the rules.
 *
 *  - verify: fee received. Also allowed after a rejection (customer paid late).
 *  - reject: first decision only; a rejected fee is not rejected again.
 *  - waive:  confirming the order without the fee (ordersService.transition).
 */
export const FEE_ACTIONS = {
  verify: {
    from: [CodFeeStatus.PENDING, CodFeeStatus.REJECTED],
    to: CodFeeStatus.VERIFIED,
  },
  reject: {
    from: [CodFeeStatus.PENDING],
    to: CodFeeStatus.REJECTED,
  },
  waive: {
    from: [CodFeeStatus.PENDING, CodFeeStatus.REJECTED],
    to: CodFeeStatus.WAIVED,
  },
} as const;

export type FeeAction = keyof typeof FEE_ACTIONS;

/** True when `action` may be applied to a fee currently in `status`. */
export function canFee(action: FeeAction, status: CodFeeStatus): boolean {
  return (FEE_ACTIONS[action].from as readonly CodFeeStatus[]).includes(status);
}

/** Statuses `action` may start from, as a mutable array for Prisma `in` filters. */
export function feeFrom(action: FeeAction): CodFeeStatus[] {
  return [...FEE_ACTIONS[action].from];
}

/**
 * Fee states where the fee counts as an advance credit against the total:
 * PENDING (expected) and VERIFIED (received). Drives `dueOnDeliveryCents`.
 */
export const FEE_CREDITED: readonly CodFeeStatus[] = [CodFeeStatus.PENDING, CodFeeStatus.VERIFIED];
