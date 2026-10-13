import { describe, expect, it } from 'vitest';

import {
  PAYMENT_METHOD_INFO,
  defaultPaymentMethod,
  effectiveSelection,
} from '../payment-methods';

describe('defaultPaymentMethod', () => {
  it('prefers COD when enabled', () => {
    expect(defaultPaymentMethod(['BANK_TRANSFER', 'COD'])).toBe('COD');
  });

  it('falls back to the first enabled method', () => {
    expect(defaultPaymentMethod(['BANK_TRANSFER'])).toBe('BANK_TRANSFER');
    expect(defaultPaymentMethod(['BKASH', 'BANK_TRANSFER'])).toBe('BKASH');
  });

  it('is null when nothing is enabled', () => {
    expect(defaultPaymentMethod([])).toBeNull();
  });
});

describe('effectiveSelection', () => {
  it('uses the default until the customer has a selection', () => {
    expect(effectiveSelection(undefined, ['COD', 'BANK_TRANSFER'])).toBe('COD');
  });

  it('keeps a selection that is still enabled', () => {
    expect(effectiveSelection('BANK_TRANSFER', ['COD', 'BANK_TRANSFER'])).toBe('BANK_TRANSFER');
  });

  it('clears a selection that is no longer enabled (no silent switch)', () => {
    expect(effectiveSelection('BANK_TRANSFER', ['COD'])).toBeNull();
    expect(effectiveSelection(null, ['COD'])).toBeNull();
  });
});

describe('PAYMENT_METHOD_INFO', () => {
  it('has a label for every method', () => {
    for (const id of ['COD', 'BKASH', 'SSLCOMMERZ', 'BANK_TRANSFER'] as const) {
      expect(PAYMENT_METHOD_INFO[id].label.length).toBeGreaterThan(0);
    }
  });
});
