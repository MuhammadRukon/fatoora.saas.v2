import { describe, expect, it } from 'vitest';

import { computeDocument, type EngineLineInput } from '../vat-engine';

const S = (quantity: string, unitPriceHalalas: number, extra: Partial<EngineLineInput> = {}): EngineLineInput => ({
  quantity,
  unitPriceHalalas,
  taxCategory: 'S',
  taxRateBp: 1500,
  ...extra,
});

describe('computeDocument', () => {
  it('AC4.1: rounds line VAT half-up (3 x 33.33 at 15%)', () => {
    const r = computeDocument({ lines: [S('3', 3333)] });
    expect(r.lines[0]).toEqual({ netHalalas: 9999, vatHalalas: 1500, totalHalalas: 11499 });
    expect(r.totals).toMatchObject({ taxHalalas: 1500, taxInclusiveHalalas: 11499, payableHalalas: 11499 });
  });

  it('AC4.2: document tax is rounded once per subtotal, not summed from lines', () => {
    const tiny = computeDocument({ lines: [S('1', 1), S('1', 1), S('1', 1)] });
    expect(tiny.lines.map((l) => l.vatHalalas)).toEqual([0, 0, 0]);
    expect(tiny.totals.taxHalalas).toBe(0); // 0.45 -> 0

    const four = computeDocument({ lines: [S('1', 4), S('1', 4), S('1', 4), S('1', 4)] });
    const lineVatSum = four.lines.reduce((n, l) => n + l.vatHalalas, 0);
    expect(lineVatSum).toBe(4); // 0.6 -> 1 each
    expect(four.totals.taxHalalas).toBe(2); // 2.4 -> 2
    expect(four.taxSubtotals).toEqual([
      { taxCategory: 'S', taxRateBp: 1500, taxableHalalas: 16, taxHalalas: 2 },
    ]);
  });

  it('AC4.3: a document discount reduces the taxable amount of a single-category document', () => {
    const r = computeDocument({ lines: [S('1', 6000), S('1', 4000)], docDiscountHalalas: 1000 });
    expect(r.totals).toEqual({
      lineExtensionHalalas: 10000,
      allowanceTotalHalalas: 1000,
      taxExclusiveHalalas: 9000,
      taxHalalas: 1350,
      taxInclusiveHalalas: 10350,
      payableHalalas: 10350,
    });
  });

  it('AC4.3: a document discount on mixed categories is refused', () => {
    expect(() =>
      computeDocument({
        lines: [S('1', 5000), { quantity: '1', unitPriceHalalas: 5000, taxCategory: 'Z', taxRateBp: 0, exemptionReasonCode: 'VATEX-SA-32' }],
        docDiscountHalalas: 1000,
      }),
    ).toThrow(/DOC_DISCOUNT_MIXED_CATEGORIES/);
  });

  it('AC4.4: exemption rules per category', () => {
    const z = (extra: Partial<EngineLineInput>): EngineLineInput => ({
      quantity: '1', unitPriceHalalas: 1000, taxCategory: 'Z', taxRateBp: 0, ...extra,
    });
    expect(() => computeDocument({ lines: [z({})] })).toThrow(/exemption/i);
    expect(() => computeDocument({ lines: [z({ exemptionReasonCode: 'VATEX-SA-29' })] })).toThrow(/exemption/i); // E code on a Z line
    const ok = computeDocument({ lines: [z({ exemptionReasonCode: 'VATEX-SA-32' })] });
    expect(ok.lines[0].vatHalalas).toBe(0);
    expect(ok.taxSubtotals[0]).toMatchObject({ taxCategory: 'Z', exemptionReasonCode: 'VATEX-SA-32' });

    const o = (extra: Partial<EngineLineInput>): EngineLineInput => ({
      quantity: '1', unitPriceHalalas: 1000, taxCategory: 'O', taxRateBp: 0, ...extra,
    });
    expect(() => computeDocument({ lines: [o({ taxRateBp: 1500, exemptionReason: 'x' })] })).toThrow();
    expect(() => computeDocument({ lines: [o({})] })).toThrow(/exemption/i);
    expect(computeDocument({ lines: [o({ exemptionReason: 'Outside scope' })] }).totals.taxHalalas).toBe(0);
  });

  it('AC4.4: quantity 0.5 x 199 halalas rounds half-up to 100', () => {
    expect(computeDocument({ lines: [S('0.5', 199)] }).lines[0].netHalalas).toBe(100);
  });

  it('applies the line discount before VAT', () => {
    const r = computeDocument({ lines: [S('2', 1000, { lineDiscountHalalas: 500 })] });
    expect(r.lines[0]).toEqual({ netHalalas: 1500, vatHalalas: 225, totalHalalas: 1725 });
  });

  it('S needs 15%, other categories 0%', () => {
    expect(() => computeDocument({ lines: [S('1', 100, { taxRateBp: 500 })] })).toThrow(/15%/);
    expect(() =>
      computeDocument({ lines: [{ quantity: '1', unitPriceHalalas: 100, taxCategory: 'E', taxRateBp: 1500, exemptionReasonCode: 'VATEX-SA-29' }] }),
    ).toThrow(/0%/);
  });

  it('rejects bad quantity, negative net, empty and oversized documents', () => {
    for (const q of ['0', '-1', 'abc', '1.1234567', '', '1e3']) {
      expect(() => computeDocument({ lines: [S(q, 100)] }), q).toThrow();
    }
    expect(() => computeDocument({ lines: [S('1', 100, { lineDiscountHalalas: 101 })] })).toThrow(/negative/i);
    expect(() => computeDocument({ lines: [] })).toThrow();
    expect(() => computeDocument({ lines: Array.from({ length: 501 }, () => S('1', 1)) })).toThrow();
    expect(() => computeDocument({ lines: [S('1', 100)], docDiscountHalalas: 101 })).toThrow(/exceeds/i);
  });

  it('keeps amounts inside the database Int range', () => {
    expect(() => computeDocument({ lines: [S('1000000', 2_000_000_000)] })).toThrow(/too large/i);
  });

  it('splits subtotals per category, rate and exemption reason', () => {
    const r = computeDocument({
      lines: [
        S('1', 1000),
        { quantity: '1', unitPriceHalalas: 500, taxCategory: 'Z', taxRateBp: 0, exemptionReasonCode: 'VATEX-SA-32' },
        { quantity: '1', unitPriceHalalas: 700, taxCategory: 'Z', taxRateBp: 0, exemptionReasonCode: 'VATEX-SA-33' },
      ],
    });
    expect(r.taxSubtotals).toHaveLength(3);
    expect(r.totals).toMatchObject({ lineExtensionHalalas: 2200, taxHalalas: 150, payableHalalas: 2350 });
  });
});
