import { describe, expect, it } from 'vitest';

import { computeShippingCents } from '../shipping';

describe('computeShippingCents', () => {
  it('returns 0 for an empty cart', () => {
    expect(
      computeShippingCents({ city: 'Dhaka', subtotalCents: 0, itemCount: 0 }),
    ).toBe(0);
  });

  it('charges the inside-Dhaka tier for Dhaka addresses', () => {
    expect(
      computeShippingCents({ city: 'Dhaka', subtotalCents: 100_00, itemCount: 1 }),
    ).toBe(60_00);
    expect(
      computeShippingCents({ city: 'dhaka', subtotalCents: 100_00, itemCount: 1 }),
    ).toBe(60_00);
  });

  it('charges the outside-Dhaka tier otherwise', () => {
    expect(
      computeShippingCents({ city: 'Chattogram', subtotalCents: 100_00, itemCount: 1 }),
    ).toBe(120_00);
  });

  it('waives shipping when subtotal crosses the free threshold', () => {
    expect(
      computeShippingCents({
        city: 'Sylhet',
        subtotalCents: 5_000_00,
        itemCount: 1,
      }),
    ).toBe(0);
  });
});
