import type { Payment } from '@prisma/client';
import { z } from 'zod';

/**
 * Customer-facing payloads. Admin-facing schemas live in
 * `src/contracts/admin.ts` if/when they grow beyond a single use.
 */

/**
 * The only Payment columns a customer-facing response may carry. Excludes
 * rawPayload, bankRef, providerRef and verifier ids/timestamps (gateway and
 * admin internals). Server queries build their `select` from this list, and
 * client code types payments as `CustomerPayment`.
 */
export const CUSTOMER_PAYMENT_FIELDS = [
  'id',
  'orderId',
  'method',
  'status',
  'amountCents',
  'feeCents',
  'feeType',
  'feeValue',
  'feeStatus',
  'customerTxnId',
  'txnSubmittedAt',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof Payment)[];
export type CustomerPaymentField = (typeof CUSTOMER_PAYMENT_FIELDS)[number];
export type CustomerPayment = Pick<Payment, CustomerPaymentField>;

export const submitBankReferenceSchema = z.object({
  paymentId: z.string().min(1),
  bankRef: z.string().min(3).max(80),
});
export type SubmitBankReferenceInput = z.infer<typeof submitBankReferenceSchema>;

export const verifyPaymentSchema = z.object({
  outcome: z.enum(['SUCCEEDED', 'FAILED']),
  note: z.string().max(300).optional(),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/**
 * Manual-payment transaction id (e.g. a bKash/Nagad TrxID). Trimmed,
 * alphanumeric, 6-30 chars, uppercased so comparisons are case-insensitive.
 */
export const TXN_ID_MIN = 6;
export const TXN_ID_MAX = 30;

export const txnIdSchema = z
  .string()
  .trim()
  .min(TXN_ID_MIN)
  .max(TXN_ID_MAX)
  .regex(/^[A-Za-z0-9]+$/, 'Transaction ID must be letters and numbers only')
  .transform((v) => v.toUpperCase());

/** Canonical stored/compared form of a transaction id (trim + uppercase). */
export function normalizeTxnId(raw: string): string {
  return raw.trim().toUpperCase();
}

export const txnCheckSchema = z.object({ txnId: txnIdSchema });
/** Response body of `POST /api/payments/txn-check`: exactly this, nothing else. */
export interface TxnCheckResult {
  exists: boolean;
}

export const submitCustomerTxnIdSchema = z.object({
  paymentId: z.string().min(1),
  txnId: txnIdSchema,
});

export const adminSetTxnIdSchema = z.object({ txnId: txnIdSchema });

export const verifyCodFeeSchema = z.object({
  outcome: z.enum(['VERIFIED', 'REJECTED']),
  note: z.string().max(300).optional(),
});

export interface InitiatedPayment {
  paymentId: string;
  /**
   * Where the client should redirect the user. `null` means the
   * payment needs no gateway hop (COD, whether auto-confirmed or awaiting
   * its confirmation fee) and the client should go to the order page.
   */
  redirectUrl: string | null;
}
