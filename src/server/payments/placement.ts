import { OrderStatus } from '@prisma/client';

import type { PlacementEvent, PlacementPlan } from './gateway.interface';

/** First audit entry of every order. */
export const ORDER_PLACED_EVENT: PlacementEvent = {
  status: OrderStatus.PENDING,
  note: 'Order placed',
};

/** A PENDING order with no fee: what every method gets unless it plans otherwise. */
export function defaultPlacementPlan(): PlacementPlan {
  return {
    paymentFields: {},
    initialStatus: OrderStatus.PENDING,
    events: [ORDER_PLACED_EVENT],
    feeRequired: false,
    fee: null,
  };
}
