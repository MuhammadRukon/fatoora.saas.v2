import { CodFeeStatus, CodFeeType, type PaymentSettings } from '@prisma/client';

import {
  COD_PERCENT_MAX,
  COD_PERCENT_MIN,
  isValidCodFeeValue,
  type CodFeeRule,
} from '@/contracts/payment-settings';

import { FEE_CREDITED } from './policy';

/**
 * COD confirmation fee calculation (pure, integer cents, client-safe).
 *
 * The fee is an advance credit against the order total: `totalCents` is
 * unchanged and the COD amount due on delivery is `total - fee`.
 *
 *  - FLAT:    `value` is cents; fee = min(value, total).
 *  - PERCENT: `value` is an integer 1..100; fee = ceil(total * value / 100),
 *             rounded UP to the next 10 BDT (1000 cents), then capped at total.
 */
export interface CodFeeInput {
  type: CodFeeType;
  value: number;
  totalCents: number;
}

/** Percent fees are rounded up to the next 10 BDT. */
const ROUND_STEP_CENTS = 1_000;

export function computeCodConfirmationFee(input: CodFeeInput): number {
  const { type, value, totalCents } = input;

  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error('totalCents must be a non-negative integer');
  }
  if (!Number.isInteger(value)) {
    throw new Error('COD fee value must be an integer');
  }

  if (type === CodFeeType.PERCENT) {
    if (!isValidCodFeeValue(CodFeeType.PERCENT, value)) {
      throw new Error(
        `COD fee percent must be between ${COD_PERCENT_MIN} and ${COD_PERCENT_MAX}`,
      );
    }
    const raw = Math.ceil((totalCents * value) / 100);
    const rounded = Math.ceil(raw / ROUND_STEP_CENTS) * ROUND_STEP_CENTS;
    return Math.min(rounded, totalCents);
  }

  if (value < 0) {
    throw new Error('COD flat fee must not be negative');
  }
  return Math.min(value, totalCents);
}

export interface ResolvedCodFee {
  feeCents: number;
  rule: CodFeeRule;
}

/**
 * The COD confirmation fee that applies to an order of `totalCents`, or
 * `null` when none does (fee switched off, or the computed fee is 0). A
 * `null` result means the COD order auto-confirms. Only the COD provider
 * asks for this, so there is no payment-method check here.
 */
export function resolveCodFee(input: {
  settings: Pick<PaymentSettings, 'codFeeEnabled' | 'codFeeType' | 'codFeeValue'>;
  totalCents: number;
}): ResolvedCodFee | null {
  const { settings, totalCents } = input;
  if (!settings.codFeeEnabled) return null;

  const feeCents = computeCodConfirmationFee({
    type: settings.codFeeType,
    value: settings.codFeeValue,
    totalCents,
  });
  if (feeCents <= 0) return null;

  return { feeCents, rule: { type: settings.codFeeType, value: settings.codFeeValue } };
}

/**
 * Amount the customer still owes in cash on delivery. The fee is an advance
 * credit only while it is PENDING (expected) or VERIFIED (received); when it
 * was WAIVED or REJECTED, or never applied, nothing was collected up front,
 * so the whole total is due. Pure and client-safe (used by order pages).
 */
export function dueOnDeliveryCents(input: {
  totalCents: number;
  feeCents: number;
  feeStatus: CodFeeStatus;
}): number {
  return FEE_CREDITED.includes(input.feeStatus)
    ? input.totalCents - input.feeCents
    : input.totalCents;
}
