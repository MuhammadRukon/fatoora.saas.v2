import { describe, expect, it } from 'vitest';
import { CodFeeType, PaymentMethod } from '@prisma/client';

import {
  blankToNull,
  defaultFeeValue,
  emptyToNull,
  toFormValues,
} from '../payment-settings-values';

describe('emptyToNull', () => {
  it('maps only the empty string to null', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull(' ')).toBe(' ');
    expect(emptyToNull('0171')).toBe('0171');
  });
});

describe('blankToNull', () => {
  it('maps null, undefined, empty and whitespace-only to null', () => {
    expect(blankToNull(null)).toBeNull();
    expect(blankToNull(undefined)).toBeNull();
    expect(blankToNull('')).toBeNull();
    expect(blankToNull('   ')).toBeNull();
  });

  it('returns non-blank text unchanged (not trimmed)', () => {
    expect(blankToNull(' pay via bKash ')).toBe(' pay via bKash ');
  });
});

describe('toFormValues', () => {
  const base = {
    id: 1,
    enabledMethods: [PaymentMethod.BKASH, PaymentMethod.COD],
    codFeeEnabled: false,
    codFeeType: CodFeeType.FLAT,
    codFeeValue: 0,
    qrImageUrl: null,
    qrImagePublicId: null,
    contactNumber: null,
    paymentNote: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Parameters<typeof toFormValues>[0];

  it('replaces an invalid stored fee with the type default and canonicalizes methods', () => {
    const v = toFormValues(base);
    expect(v.codFeeValue).toBe(defaultFeeValue(CodFeeType.FLAT));
    expect(v.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BKASH]);
  });

  it('keeps a valid stored fee', () => {
    expect(toFormValues({ ...base, codFeeType: CodFeeType.PERCENT, codFeeValue: 25 }).codFeeValue).toBe(
      25,
    );
  });
});
