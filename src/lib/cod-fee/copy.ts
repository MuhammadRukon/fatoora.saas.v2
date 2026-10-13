import { CodFeeType } from '@prisma/client';

import type { CodFeeRule } from '@/contracts/payment-settings';
import { formatBDT } from '@/server/common/money';

/**
 * Lowercase "contact admin" clause for customer-facing copy, with the store's
 * contact number when one is configured. Pure; safe on client and server.
 */
export function adminClause(contactNumber: string | null): string {
  return contactNumber ? `contact admin at ${contactNumber}` : 'contact admin';
}

/** Human-readable rule text, e.g. `flat Tk 100` or `25% = Tk 130`. */
export function describeCodFeeRule(rule: CodFeeRule, feeCents: number): string {
  return rule.type === CodFeeType.PERCENT
    ? `${rule.value}% = ${formatBDT(feeCents)}`
    : `flat ${formatBDT(feeCents)}`;
}

export interface CodFeeWarningInput extends CodFeeRule {
  /** Fee amount snapshotted on the Payment. */
  feeCents: number;
  contactNumber: string | null;
}

/**
 * Customer-facing warning for a COD order that needs its confirmation fee.
 * Built from the Payment snapshot (`feeType`/`feeValue`/`feeCents`), never
 * live settings, so it stays correct if the admin later changes the rule.
 */
export function buildCodFeeWarning(input: CodFeeWarningInput): string {
  const rule = describeCodFeeRule({ type: input.type, value: input.value }, input.feeCents);
  const action = `Pay or ${adminClause(input.contactNumber)}.`;
  return `This order requires a confirmation fee (${rule}) to be confirmed. ${action}`;
}

/** Order-page alert for a fee the admin could not verify. */
export function buildFeeRejectedMessage(contactNumber: string | null): string {
  return `Your confirmation fee could not be verified. ${
    contactNumber ? `Contact admin at ${contactNumber}.` : 'Contact admin.'
  }`;
}
