import { CodFeeType, PaymentMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { canonicalMethods, paymentSettingsInputSchema } from '../payment-settings';

const valid = {
  enabledMethods: [PaymentMethod.COD],
  codFeeEnabled: true,
  codFeeType: CodFeeType.FLAT,
  codFeeValue: 10_000,
  qrImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/settings/qr.png',
  qrImagePublicId: 'settings/qr',
  contactNumber: '01800000000',
  paymentNote: 'Pay via bKash personal.',
};

function issuePaths(input: unknown): string[] {
  const res = paymentSettingsInputSchema.safeParse(input);
  if (res.success) return [];
  return res.error.issues.map((i) => i.path.join('.'));
}

describe('paymentSettingsInputSchema', () => {
  it('accepts a valid FLAT configuration', () => {
    expect(paymentSettingsInputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a valid PERCENT configuration', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      codFeeType: CodFeeType.PERCENT,
      codFeeValue: 25,
    });
    expect(res.success).toBe(true);
  });

  it('accepts +880 / 880 / local mobile formats', () => {
    for (const contactNumber of ['01800000000', '8801800000000', '+8801800000000']) {
      expect(paymentSettingsInputSchema.safeParse({ ...valid, contactNumber }).success).toBe(true);
    }
  });

  it('rejects PERCENT value 0', () => {
    const input = { ...valid, codFeeType: CodFeeType.PERCENT, codFeeValue: 0 };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('codFeeValue');
  });

  it('rejects PERCENT value 101', () => {
    const input = { ...valid, codFeeType: CodFeeType.PERCENT, codFeeValue: 101 };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('codFeeValue');
  });

  it('rejects a non-integer PERCENT value', () => {
    const input = { ...valid, codFeeType: CodFeeType.PERCENT, codFeeValue: 12.5 };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects FLAT value 150 (not a multiple of 100 cents)', () => {
    const input = { ...valid, codFeeType: CodFeeType.FLAT, codFeeValue: 150 };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('codFeeValue');
  });

  it('rejects FLAT value below 100 cents', () => {
    const input = { ...valid, codFeeType: CodFeeType.FLAT, codFeeValue: 0 };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
  });

  it('rejects codFeeEnabled=true without contactNumber', () => {
    const input = { ...valid, contactNumber: null };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('contactNumber');
    const omitted: Record<string, unknown> = { ...valid };
    delete omitted.contactNumber;
    expect(paymentSettingsInputSchema.safeParse(omitted).success).toBe(false);
  });

  it('allows a missing contactNumber when codFeeEnabled=false', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      codFeeEnabled: false,
      contactNumber: null,
    });
    expect(res.success).toBe(true);
  });

  it("rejects contactNumber '12345'", () => {
    const input = { ...valid, contactNumber: '12345' };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('contactNumber');
  });

  it('rejects a non-Cloudinary / non-https qrImageUrl', () => {
    for (const qrImageUrl of ['http://evil.com/x.png', 'https://evil.com/x.png']) {
      const input = { ...valid, qrImageUrl };
      expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
      expect(issuePaths(input)).toContain('qrImageUrl');
    }
  });

  it('rejects Cloudinary URLs that are not plain image uploads', () => {
    for (const qrImageUrl of [
      // fetch-type delivery proxies an arbitrary remote URL through the account
      'https://res.cloudinary.com/demo/image/fetch/https://evil.com/x.png',
      'https://res.cloudinary.com/demo/video/upload/v1/settings/qr.png',
      'https://res.cloudinary.com/demo/image/private/v1/settings/qr.png',
      // not the Cloudinary host, despite starting with its name
      'https://res.cloudinary.com.evil.com/demo/image/upload/v1/settings/qr.png',
      'https://res.cloudinary.com@evil.com/demo/image/upload/v1/settings/qr.png',
      'https://res.cloudinary.com:8443/demo/image/upload/v1/settings/qr.png',
      'not a url',
    ]) {
      const input = { ...valid, qrImageUrl };
      expect(paymentSettingsInputSchema.safeParse(input).success, qrImageUrl).toBe(false);
    }
  });

  it('requires qrImageUrl and qrImagePublicId to be set together', () => {
    const urlOnly = { ...valid, qrImagePublicId: null };
    const idOnly = { ...valid, qrImageUrl: null };
    expect(paymentSettingsInputSchema.safeParse(urlOnly).success).toBe(false);
    expect(paymentSettingsInputSchema.safeParse(idOnly).success).toBe(false);
    expect(issuePaths(urlOnly)).toContain('qrImagePublicId');
    expect(issuePaths(idOnly)).toContain('qrImageUrl');
  });

  it('rejects a qrImagePublicId that does not match the URL', () => {
    for (const qrImagePublicId of ['settings/other', 'settings/qr.png/extra', 'qr', 'a/../b']) {
      const input = { ...valid, qrImagePublicId };
      expect(paymentSettingsInputSchema.safeParse(input).success, qrImagePublicId).toBe(false);
      expect(issuePaths(input)).toContain('qrImagePublicId');
    }
  });

  it('accepts a matching URL and publicId, with or without a version segment', () => {
    for (const qrImageUrl of [
      'https://res.cloudinary.com/demo/image/upload/v1/settings/qr.png',
      'https://res.cloudinary.com/demo/image/upload/settings/qr.png',
      'https://res.cloudinary.com/demo/image/upload/settings/qr',
    ]) {
      expect(
        paymentSettingsInputSchema.safeParse({ ...valid, qrImageUrl }).success,
        qrImageUrl,
      ).toBe(true);
    }
  });

  it('accepts a null qrImageUrl', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      qrImageUrl: null,
      qrImagePublicId: null,
    });
    expect(res.success).toBe(true);
  });

  it('rejects a paymentNote over 500 characters', () => {
    const input = { ...valid, paymentNote: 'x'.repeat(501) };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(
      paymentSettingsInputSchema.safeParse({ ...valid, paymentNote: 'x'.repeat(500) }).success,
    ).toBe(true);
  });

  it('has no default on enabledMethods', () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.enabledMethods;
    expect(paymentSettingsInputSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts an empty enabledMethods (the service rejects it with a 400)', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      enabledMethods: [],
      codFeeEnabled: false,
    });
    expect(res.success).toBe(true);
  });

  it('rejects an unknown method', () => {
    const input = { ...valid, enabledMethods: [PaymentMethod.COD, 'PAYPAL'] };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input).some((p) => p.startsWith('enabledMethods'))).toBe(true);
  });

  it('de-duplicates enabledMethods', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      enabledMethods: [PaymentMethod.COD, PaymentMethod.COD, PaymentMethod.BANK_TRANSFER],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BANK_TRANSFER]);
    }
  });

  it('normalizes enabledMethods to enum order', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      enabledMethods: [PaymentMethod.BANK_TRANSFER, PaymentMethod.BKASH, PaymentMethod.COD],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.enabledMethods).toEqual([
        PaymentMethod.COD,
        PaymentMethod.BKASH,
        PaymentMethod.BANK_TRANSFER,
      ]);
    }
  });

  it('rejects codFeeEnabled=true when COD is not in enabledMethods', () => {
    const input = { ...valid, enabledMethods: [PaymentMethod.BANK_TRANSFER] };
    expect(paymentSettingsInputSchema.safeParse(input).success).toBe(false);
    expect(issuePaths(input)).toContain('codFeeEnabled');
  });

  it('accepts codFeeEnabled=true when COD is listed among other methods', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      enabledMethods: [PaymentMethod.BANK_TRANSFER, PaymentMethod.COD],
    });
    expect(res.success).toBe(true);
  });

  it('allows codFeeEnabled=false when COD is not in enabledMethods', () => {
    const res = paymentSettingsInputSchema.safeParse({
      ...valid,
      enabledMethods: [PaymentMethod.BANK_TRANSFER],
      codFeeEnabled: false,
    });
    expect(res.success).toBe(true);
  });
});

describe('canonicalMethods', () => {
  it('returns enum order with duplicates removed', () => {
    expect(
      canonicalMethods([
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.SSLCOMMERZ,
        PaymentMethod.BANK_TRANSFER,
        PaymentMethod.COD,
      ]),
    ).toEqual([PaymentMethod.COD, PaymentMethod.SSLCOMMERZ, PaymentMethod.BANK_TRANSFER]);
  });

  it('does not mutate its input and handles an empty list', () => {
    const input = [PaymentMethod.BKASH, PaymentMethod.COD];
    canonicalMethods(input);
    expect(input).toEqual([PaymentMethod.BKASH, PaymentMethod.COD]);
    expect(canonicalMethods([])).toEqual([]);
  });
});
