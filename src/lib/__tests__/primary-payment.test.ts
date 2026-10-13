import { describe, expect, it } from 'vitest';

import { primaryPayment } from '../primary-payment';

describe('primaryPayment', () => {
  it('returns the first (and only) payment', () => {
    const payment = { id: 'p1', method: 'COD' };
    expect(primaryPayment({ payments: [payment] })).toBe(payment);
  });

  it('returns the first payment if the relation ever holds more than one', () => {
    const first = { id: 'p1' };
    expect(primaryPayment({ payments: [first, { id: 'p2' }] })).toBe(first);
  });

  it('returns undefined when the order has no payment', () => {
    expect(primaryPayment({ payments: [] })).toBeUndefined();
  });
});
