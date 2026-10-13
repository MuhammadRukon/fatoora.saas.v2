import { CodFeeType } from '@prisma/client';

import {
  canonicalMethods,
  isValidCodFeeValue,
  type PaymentSettingsInput,
} from '@/contracts/payment-settings';
import type { AdminPaymentSettingsResponse } from '@/modules/admin/settings/hooks';

const DEFAULT_FLAT_CENTS = 10_000; // 100 BDT
const DEFAULT_PERCENT = 10;

export function defaultFeeValue(type: CodFeeType): number {
  return type === CodFeeType.PERCENT ? DEFAULT_PERCENT : DEFAULT_FLAT_CENTS;
}

/**
 * Maps the stored row to form values. The contract validates `codFeeValue`
 * for its type even while the fee is off, and the seeded row stores 0, so an
 * invalid stored value is replaced by a valid default here.
 */
export function toFormValues(
  settings: AdminPaymentSettingsResponse['settings'],
): PaymentSettingsInput {
  return {
    enabledMethods: canonicalMethods(settings.enabledMethods),
    codFeeEnabled: settings.codFeeEnabled,
    codFeeType: settings.codFeeType,
    codFeeValue: isValidCodFeeValue(settings.codFeeType, settings.codFeeValue)
      ? settings.codFeeValue
      : defaultFeeValue(settings.codFeeType),
    qrImageUrl: settings.qrImageUrl,
    qrImagePublicId: settings.qrImagePublicId,
    contactNumber: settings.contactNumber,
    paymentNote: settings.paymentNote,
  };
}

/**
 * Text-field onChange value: an emptied field is stored as null, anything
 * else (including whitespace, so typing is never swallowed) as typed.
 */
export function emptyToNull(text: string): string | null {
  return text === '' ? null : text;
}

/** Submit-time value: null or whitespace-only becomes null, otherwise the text unchanged. */
export function blankToNull(text: string | null | undefined): string | null {
  return text?.trim() ? text : null;
}
