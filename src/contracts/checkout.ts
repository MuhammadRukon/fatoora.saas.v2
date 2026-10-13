import { PaymentMethod } from '@prisma/client';
import { z } from 'zod';

import type { CodFeeRule } from './payment-settings';
import { txnIdSchema } from './payments';

export const paymentMethodSchema = z.enum(PaymentMethod);

export const checkoutInputSchema = z.object({
  addressId: z.string().min(1),
  paymentMethod: paymentMethodSchema,
  couponCode: z.string().optional(),
  notes: z.string().max(500).optional(),
  /** Optional manual-payment txn id for the COD confirmation fee. Ignored when no fee applies. */
  customerTxnId: txnIdSchema.optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const checkoutQuoteSchema = z.object({
  addressId: z.string().min(1),
  couponCode: z.string().optional(),
  paymentMethod: paymentMethodSchema.optional(),
});

export const stockConflictMetaSchema = z.object({
  variantId: z.string(),
  productName: z.string(),
  reason: z.enum(['insufficient_stock', 'unavailable']),
});
export type StockConflictMeta = z.infer<typeof stockConflictMetaSchema>;

export interface CheckoutQuote {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  /** Grand total. Unchanged by the COD confirmation fee (the fee is an advance credit). */
  totalCents: number;
  couponCode: string | null;
  /** Confirmation fee applying to this order (0 when none). */
  codFeeCents: number;
  /** `totalCents - codFeeCents`: what the customer pays on delivery. */
  dueOnDeliveryCents: number;
  codFeeRule: CodFeeRule | null;
}

/** `meta` of the 400 thrown when the chosen payment method is not currently enabled. */
export const paymentMethodUnavailableMetaSchema = z.object({
  reason: z.literal('payment_method_unavailable'),
  method: paymentMethodSchema,
});
export type PaymentMethodUnavailableMeta = z.infer<typeof paymentMethodUnavailableMetaSchema>;
