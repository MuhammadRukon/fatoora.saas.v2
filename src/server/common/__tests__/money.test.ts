import { describe, expect, it } from 'vitest';

import { CURRENCY, formatSAR, fromHalalas, toHalalas } from '../money';

describe('money: toHalalas', () => {
  it('rounds half-up at the third decimal without float drift', () => {
    expect(toHalalas('10.005')).toBe(1001);
    expect(toHalalas('10.004')).toBe(1000);
    expect(toHalalas('1.015')).toBe(102); // parseFloat('1.015') * 100 = 101.49999...
    expect(toHalalas('0.995')).toBe(100);
  });

  it('accepts whole, short and padded decimals', () => {
    expect(toHalalas('10')).toBe(1000);
    expect(toHalalas('10.5')).toBe(1050);
    expect(toHalalas('.5')).toBe(50);
    expect(toHalalas(' 3.00 ')).toBe(300);
    expect(toHalalas('0')).toBe(0);
  });

  it('accepts numbers via their shortest decimal form', () => {
    expect(toHalalas(10)).toBe(1000);
    expect(toHalalas(0.1)).toBe(10);
    expect(toHalalas(10.005)).toBe(1001);
  });

  it('rounds negatives away from zero and never returns -0', () => {
    expect(toHalalas('-10.005')).toBe(-1001);
    expect(Object.is(toHalalas('-0.004'), 0)).toBe(true);
  });

  it('rejects non-decimal and out-of-range input', () => {
    for (const bad of ['', '.', '-', 'abc', '1,000', '1.2.3', '1e3']) {
      expect(() => toHalalas(bad)).toThrow();
    }
    expect(() => toHalalas(NaN)).toThrow();
    expect(() => toHalalas(Infinity)).toThrow();
    expect(() => toHalalas(1e21)).toThrow();
    expect(() => toHalalas('99999999999999999')).toThrow();
  });
});

describe('money: fromHalalas', () => {
  it('renders exactly 2 decimals', () => {
    expect(fromHalalas(150)).toBe('1.50');
    expect(fromHalalas(5)).toBe('0.05');
    expect(fromHalalas(0)).toBe('0.00');
    expect(fromHalalas(123456)).toBe('1234.56');
    expect(fromHalalas(-150)).toBe('-1.50');
  });

  it('rejects non-integers', () => {
    expect(() => fromHalalas(1.5)).toThrow();
  });
});

describe('money: formatSAR', () => {
  it('formats en with grouping and 2 decimals', () => {
    expect(formatSAR(123456, 'en')).toContain('1,234.56');
    expect(formatSAR(100, 'en')).toContain('1.00');
  });

  it('formats ar with Arabic-Indic digits', () => {
    expect(formatSAR(123456, 'ar')).toContain('١٬٢٣٤٫٥٦');
  });

  it('uses SAR', () => {
    expect(CURRENCY).toBe('SAR');
  });
});
