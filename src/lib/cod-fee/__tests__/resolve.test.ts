import { CodFeeType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { resolveCodFee } from '../compute';

function settings(overrides: Partial<Parameters<typeof resolveCodFee>[0]['settings']> = {}) {
  return {
    codFeeEnabled: true,
    codFeeType: CodFeeType.FLAT,
    codFeeValue: 10_000,
    ...overrides,
  };
}

describe('resolveCodFee', () => {
  it('returns the flat fee and rule when the fee is on', () => {
    expect(resolveCodFee({ settings: settings(), totalCents: 500_000 })).toEqual({
      feeCents: 10_000,
      rule: { type: CodFeeType.FLAT, value: 10_000 },
    });
  });

  it('rounds a percent fee up to the next 10 BDT', () => {
    expect(
      resolveCodFee({
        settings: settings({ codFeeType: CodFeeType.PERCENT, codFeeValue: 25 }),
        totalCents: 49_840,
      }),
    ).toEqual({ feeCents: 13_000, rule: { type: CodFeeType.PERCENT, value: 25 } });
  });

  it('caps the fee at the total', () => {
    expect(resolveCodFee({ settings: settings(), totalCents: 6_000 })?.feeCents).toBe(6_000);
  });

  it('returns null when the fee is off', () => {
    expect(
      resolveCodFee({ settings: settings({ codFeeEnabled: false }), totalCents: 500_000 }),
    ).toBeNull();
  });

  it('returns null when the computed fee is 0 (zero total)', () => {
    expect(resolveCodFee({ settings: settings(), totalCents: 0 })).toBeNull();
    expect(
      resolveCodFee({
        settings: settings({ codFeeType: CodFeeType.PERCENT, codFeeValue: 50 }),
        totalCents: 0,
      }),
    ).toBeNull();
  });

  it('returns null when the flat value is 0', () => {
    expect(
      resolveCodFee({ settings: settings({ codFeeValue: 0 }), totalCents: 500_000 }),
    ).toBeNull();
  });
});
