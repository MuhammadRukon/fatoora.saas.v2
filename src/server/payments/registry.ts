import { PaymentMethod } from '@prisma/client';

import { bankTransferGateway } from './providers/bank-transfer';
import { bkashGateway } from './providers/bkash';
import { codGateway } from './providers/cod';
import { sslcommerzGateway } from './providers/sslcommerz';

import { defaultPlacementPlan } from './placement';

import type { PaymentGateway, PlacementContext, PlacementPlan } from './gateway.interface';

const REGISTRY: Record<PaymentMethod, PaymentGateway> = {
  [PaymentMethod.COD]: codGateway,
  [PaymentMethod.SSLCOMMERZ]: sslcommerzGateway,
  [PaymentMethod.BKASH]: bkashGateway,
  [PaymentMethod.BANK_TRANSFER]: bankTransferGateway,
};

export function getGateway(method: PaymentMethod): PaymentGateway {
  return REGISTRY[method];
}

/** How an order paid with `method` is created (see `PaymentGateway.planPlacement`). */
export function planPlacement(method: PaymentMethod, ctx: PlacementContext): PlacementPlan {
  return getGateway(method).planPlacement?.(ctx) ?? defaultPlacementPlan();
}
