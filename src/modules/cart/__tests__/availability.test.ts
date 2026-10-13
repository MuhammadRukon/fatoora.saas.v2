import { describe, expect, it } from 'vitest';

import type { CartLine, CartSnapshot } from '@/contracts/cart';
import {
  cartAvailability,
  cartHeaderLabel,
  classifyHydrate,
  guestBadgeCount,
  lineUnavailableReason,
  needsRevalidation,
} from '../availability';

const line = (variantId: string, over: Partial<CartLine> = {}): CartLine => ({
  itemId: variantId,
  variantId,
  productId: '',
  productSlug: variantId,
  productName: variantId,
  variantName: null,
  sku: variantId,
  imageUrl: null,
  unitPriceCents: 1000,
  originalUnitPriceCents: 1000,
  quantity: 1,
  stock: 10,
  isActive: true,
  ...over,
});

describe('lineUnavailableReason', () => {
  it('inactive wins, then sold out; in stock (even above stock) is available', () => {
    expect(lineUnavailableReason(line('a', { isActive: false, stock: 0 }))).toBe(
      'No longer available',
    );
    expect(lineUnavailableReason(line('a', { stock: 0 }))).toBe('Sold out');
    expect(lineUnavailableReason(line('a', { quantity: 5, stock: 2 }))).toBeNull();
  });
});

describe('cartAvailability', () => {
  it('excludes unavailable lines from the count and subtotal and counts them separately', () => {
    const result = cartAvailability([
      line('ok', { quantity: 2, unitPriceCents: 500 }),
      line('sold', { quantity: 3, stock: 0 }),
      line('off', { quantity: 1, isActive: false }),
    ]);
    expect(result).toEqual({ itemCount: 2, subtotalCents: 1000, unavailableCount: 2 });
  });
});

describe('cartHeaderLabel', () => {
  it('reads "N items · M unavailable", singular for one, no suffix without unavailable lines', () => {
    expect(cartHeaderLabel({ itemCount: 3, subtotalCents: 0, unavailableCount: 1 })).toBe(
      '3 items · 1 unavailable',
    );
    expect(cartHeaderLabel({ itemCount: 1, subtotalCents: 0, unavailableCount: 0 })).toBe('1 item');
    expect(cartHeaderLabel({ itemCount: 0, subtotalCents: 0, unavailableCount: 2 })).toBe(
      '0 items · 2 unavailable',
    );
  });
});

describe('guestBadgeCount', () => {
  const lines = [
    { variantId: 'a', quantity: 2 },
    { variantId: 'b', quantity: 3 },
    { variantId: 'new', quantity: 1 },
  ];
  it('is the raw store sum before any hydrate has marked a line unavailable', () => {
    expect(guestBadgeCount(lines, [])).toBe(6);
  });
  it('skips the lines the last hydrate found unavailable but still counts lines added since', () => {
    expect(guestBadgeCount(lines, ['b'])).toBe(3);
  });
});

describe('needsRevalidation', () => {
  const now = 1_000_000_000_000;
  const day = 24 * 60 * 60 * 1000;
  it('is true when never validated or older than 24 h, false otherwise', () => {
    expect(needsRevalidation(null, now)).toBe(true);
    expect(needsRevalidation(now - day - 1, now)).toBe(true);
    expect(needsRevalidation(now - day + 1000, now)).toBe(false);
  });
});

describe('classifyHydrate', () => {
  it('splits requested lines into missing (not returned) and unavailable (returned but dead)', () => {
    const snapshot: CartSnapshot = {
      lines: [line('ok'), line('sold', { stock: 0 }), line('off', { isActive: false })],
      subtotalCents: 0,
      itemCount: 0,
    };
    const requested = ['ok', 'sold', 'off', 'gone'].map((variantId) => ({
      variantId,
      quantity: 1,
    }));
    expect(classifyHydrate(requested, snapshot)).toEqual({
      missing: ['gone'],
      unavailable: ['sold', 'off'],
    });
  });
});
