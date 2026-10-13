import { CodFeeStatus, CodFeeType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { formatBDT } from '@/server/common/money';

import { computeCodConfirmationFee, dueOnDeliveryCents } from '../compute';
import { buildCodFeeWarning, buildFeeRejectedMessage, describeCodFeeRule } from '../copy';

const FLAT = CodFeeType.FLAT;
const PERCENT = CodFeeType.PERCENT;

describe('computeCodConfirmationFee', () => {
  it('FLAT returns the configured amount when the total covers it', () => {
    expect(computeCodConfirmationFee({ type: FLAT, value: 10_000, totalCents: 500_000 })).toBe(
      10_000,
    );
  });

  it('FLAT is capped at the order total', () => {
    expect(computeCodConfirmationFee({ type: FLAT, value: 10_000, totalCents: 6_000 })).toBe(6_000);
  });

  it('PERCENT rounds the fee up to the next 10 BDT (124.6 -> 130)', () => {
    expect(computeCodConfirmationFee({ type: PERCENT, value: 25, totalCents: 49_840 })).toBe(
      13_000,
    );
  });

  it('PERCENT does not round further when already a multiple of 10 BDT', () => {
    expect(computeCodConfirmationFee({ type: PERCENT, value: 50, totalCents: 100_000 })).toBe(
      50_000,
    );
  });

  it('PERCENT 100 is capped at the total after rounding up', () => {
    expect(computeCodConfirmationFee({ type: PERCENT, value: 100, totalCents: 12_345 })).toBe(
      12_345,
    );
  });

  it('PERCENT ceils fractional cents before rounding to 10 BDT', () => {
    // 1% of 10_100 cents = 101 cents -> rounds up to 1000
    expect(computeCodConfirmationFee({ type: PERCENT, value: 1, totalCents: 101_00 })).toBe(1_000);
    // 3% of 33_400 = 1002 exactly -> 2000
    expect(computeCodConfirmationFee({ type: PERCENT, value: 3, totalCents: 33_400 })).toBe(2_000);
  });

  it('returns 0 for a zero total with either type', () => {
    expect(computeCodConfirmationFee({ type: FLAT, value: 10_000, totalCents: 0 })).toBe(0);
    expect(computeCodConfirmationFee({ type: PERCENT, value: 25, totalCents: 0 })).toBe(0);
  });

  it('throws for PERCENT values outside 1-100', () => {
    expect(() =>
      computeCodConfirmationFee({ type: PERCENT, value: 0, totalCents: 10_000 }),
    ).toThrow();
    expect(() =>
      computeCodConfirmationFee({ type: PERCENT, value: 101, totalCents: 10_000 }),
    ).toThrow();
  });

  it('throws for a fractional PERCENT value or a negative / fractional total', () => {
    expect(() =>
      computeCodConfirmationFee({ type: PERCENT, value: 12.5, totalCents: 10_000 }),
    ).toThrow();
    expect(() => computeCodConfirmationFee({ type: FLAT, value: 100, totalCents: -1 })).toThrow();
    expect(() => computeCodConfirmationFee({ type: FLAT, value: 100, totalCents: 10.5 })).toThrow();
  });

  it('throws for a negative FLAT value', () => {
    expect(() => computeCodConfirmationFee({ type: FLAT, value: -100, totalCents: 10_000 })).toThrow();
  });
});

describe('describeCodFeeRule', () => {
  it('describes a FLAT rule', () => {
    expect(describeCodFeeRule({ type: FLAT, value: 10_000 }, 10_000)).toBe(
      `flat ${formatBDT(10_000)}`,
    );
  });

  it('describes a PERCENT rule with the computed amount', () => {
    expect(describeCodFeeRule({ type: PERCENT, value: 25 }, 13_000)).toBe(
      `25% = ${formatBDT(13_000)}`,
    );
  });
});

describe('buildCodFeeWarning', () => {
  it('describes a FLAT rule with the admin contact', () => {
    expect(
      buildCodFeeWarning({
        type: FLAT,
        value: 10_000,
        feeCents: 10_000,
        contactNumber: '01800000000',
      }),
    ).toBe(
      `This order requires a confirmation fee (flat ${formatBDT(10_000)}) to be confirmed. Pay or contact admin at 01800000000.`,
    );
  });

  it('describes a PERCENT rule with the computed amount', () => {
    expect(
      buildCodFeeWarning({
        type: PERCENT,
        value: 25,
        feeCents: 13_000,
        contactNumber: '01800000000',
      }),
    ).toBe(
      `This order requires a confirmation fee (25% = ${formatBDT(13_000)}) to be confirmed. Pay or contact admin at 01800000000.`,
    );
  });

  it('drops the contact clause when no contact number is set', () => {
    const msg = buildCodFeeWarning({
      type: FLAT,
      value: 10_000,
      feeCents: 10_000,
      contactNumber: null,
    });
    expect(msg.endsWith('Pay or contact admin.')).toBe(true);
    expect(msg).not.toContain(' at ');
  });
});

describe('dueOnDeliveryCents', () => {
  const base = { totalCents: 500_000, feeCents: 10_000 };

  it('subtracts the fee while it is PENDING or VERIFIED (advance credit)', () => {
    expect(dueOnDeliveryCents({ ...base, feeStatus: CodFeeStatus.PENDING })).toBe(490_000);
    expect(dueOnDeliveryCents({ ...base, feeStatus: CodFeeStatus.VERIFIED })).toBe(490_000);
  });

  it('is the full total when the fee was WAIVED, REJECTED or never applied', () => {
    expect(dueOnDeliveryCents({ ...base, feeStatus: CodFeeStatus.WAIVED })).toBe(500_000);
    expect(dueOnDeliveryCents({ ...base, feeStatus: CodFeeStatus.REJECTED })).toBe(500_000);
    expect(dueOnDeliveryCents({ ...base, feeStatus: CodFeeStatus.NONE })).toBe(500_000);
  });
});

describe('buildFeeRejectedMessage', () => {
  it('points the customer at admin', () => {
    expect(buildFeeRejectedMessage('01800000000')).toBe(
      'Your confirmation fee could not be verified. Contact admin at 01800000000.',
    );
    expect(buildFeeRejectedMessage(null)).toBe(
      'Your confirmation fee could not be verified. Contact admin.',
    );
  });
});
