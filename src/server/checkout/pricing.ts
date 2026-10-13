import type { PaymentMethod, PaymentSettings, Prisma } from '@prisma/client';

import type { prisma } from '@/lib/prisma';
import { couponsService } from '@/server/coupons/coupons.service';
import type { PlacementPlan } from '@/server/payments/gateway.interface';
import { planPlacement } from '@/server/payments/registry';

import type { ResolvedCartLine } from './cart-lines';
import { computeShippingCents } from './shipping';

/** Either the global client or an in-flight `prisma.$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

export interface PriceOrderInput {
  userId: string;
  address: { city: string };
  lines: Pick<ResolvedCartLine, 'unitPriceCents' | 'quantity'>[];
  couponCode?: string;
  /**
   * The payment method and the settings it is priced against. Omit for a
   * quote that asks about no particular method (no placement plan then).
   * `customerTxnId` is the raw id the customer typed (placement only).
   */
  payment?: { method: PaymentMethod; settings: PaymentSettings; customerTxnId?: string | null };
}

export interface PricedOrder {
  subtotalCents: number;
  discountCents: number;
  couponId: string | null;
  couponCode: string | null;
  shippingCents: number;
  /** Grand total; unchanged by the COD confirmation fee (an advance credit). */
  totalCents: number;
  /** How the chosen payment method places the order (fee included); null without `payment`. */
  plan: PlacementPlan | null;
}

/**
 * Single source of truth for order pricing, shared by `quote()` and
 * `placeOrder` so the two can never drift: subtotal, coupon, shipping,
 * total, and the payment method's placement plan (which carries the COD
 * fee). Pass the transaction client from `placeOrder` so the coupon is
 * re-validated inside the transaction. All values are integer cents. Does
 * not check that the payment method is available; callers do
 * (`assertMethodAvailable`) at the point their flow needs it.
 */
export async function priceOrder(
  db: Db,
  input: PriceOrderInput & { payment: NonNullable<PriceOrderInput['payment']> },
): Promise<PricedOrder & { plan: PlacementPlan }>;
export async function priceOrder(db: Db, input: PriceOrderInput): Promise<PricedOrder>;
export async function priceOrder(db: Db, input: PriceOrderInput): Promise<PricedOrder> {
  const { userId, address, lines, payment } = input;
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  let discountCents = 0;
  let couponId: string | null = null;
  let couponCode: string | null = null;
  if (input.couponCode) {
    const validated = await couponsService.validate(
      { code: input.couponCode, userId, subtotalCents },
      db,
    );
    discountCents = validated.discountCents;
    couponId = validated.id;
    couponCode = validated.code;
  }

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const shippingCents = computeShippingCents({
    city: address.city,
    subtotalCents: subtotalCents - discountCents,
    itemCount,
  });
  const totalCents = Math.max(0, subtotalCents - discountCents) + shippingCents;

  const plan = payment
    ? planPlacement(payment.method, {
        settings: payment.settings,
        totalCents,
        customerTxnId: payment.customerTxnId,
      })
    : null;

  return {
    subtotalCents,
    discountCents,
    couponId,
    couponCode,
    shippingCents,
    totalCents,
    plan,
  };
}
