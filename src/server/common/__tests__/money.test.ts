import { describe, expect, it } from 'vitest';

import {
  applyDiscount,
  applyPercentDiscount,
  formatBDT,
  takaToCents,
} from '../money';

describe('money: takaToCents', () => {
  it('rounds to nearest cent without floating drift', () => {
    expect(takaToCents(10)).toBe(1000);
    expect(takaToCents(0.1)).toBe(10);
    expect(takaToCents(0.015)).toBe(2); // banker's? — Math.round → 2
  });

  it('rejects non-finite input', () => {
    expect(() => takaToCents(NaN)).toThrow();
    expect(() => takaToCents(Infinity)).toThrow();
  });
});

describe('money: applyDiscount (flat)', () => {
  it('subtracts discount but never below zero', () => {
    expect(applyDiscount(10000, 1500)).toBe(8500);
    expect(applyDiscount(10000, 20000)).toBe(0);
  });

  it('returns the original price when discount is non-positive', () => {
    expect(applyDiscount(10000, 0)).toBe(10000);
    expect(applyDiscount(10000, -50)).toBe(10000);
  });
});

describe('money: applyPercentDiscount', () => {
  it('clamps percent to [0, 100]', () => {
    expect(applyPercentDiscount(10000, 0)).toBe(0);
    expect(applyPercentDiscount(10000, 50)).toBe(5000);
    expect(applyPercentDiscount(10000, 200)).toBe(10000);
    expect(applyPercentDiscount(10000, -10)).toBe(0);
  });

  it('floors fractional cents to avoid over-discounting', () => {
    expect(applyPercentDiscount(999, 33)).toBe(329); // 329.67 → 329
  });
});

describe('money: formatBDT', () => {
  it('renders BDT amount with Tk prefix by default', () => {
    expect(formatBDT(123456)).toMatch(/^Tk\s*1,?234\.56$/);
  });

  it('omits symbol when requested', () => {
    expect(formatBDT(100000, { withSymbol: false })).not.toMatch(/Tk/);
  });
});
