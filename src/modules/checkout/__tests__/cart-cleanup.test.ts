import { describe, expect, it } from 'vitest';

import type { CartLine } from '@/contracts/cart';
import { cleanupNotice, planCartCleanup } from '../cart-cleanup';

const line = (id: string, over: Partial<CartLine> = {}): CartLine => ({
  itemId: `item-${id}`,
  variantId: id,
  productId: '',
  productSlug: id,
  productName: id.toUpperCase(),
  variantName: null,
  sku: id,
  imageUrl: null,
  unitPriceCents: 1000,
  originalUnitPriceCents: 1000,
  quantity: 1,
  stock: 10,
  isActive: true,
  ...over,
});

describe('planCartCleanup', () => {
  it('removes inactive and sold-out lines and clamps lines above a positive stock', () => {
    const plan = planCartCleanup([
      line('ok', { quantity: 2 }),
      line('sold', { stock: 0, quantity: 2 }),
      line('off', { isActive: false }),
      line('over', { quantity: 5, stock: 2 }),
    ]);
    expect(plan.remove.map((l) => l.variantId)).toEqual(['sold', 'off']);
    expect(plan.reduce.map((r) => [r.line.variantId, r.quantity])).toEqual([['over', 2]]);
  });

  it('plans nothing for a healthy cart', () => {
    const plan = planCartCleanup([line('a', { quantity: 10, stock: 10 }), line('b')]);
    expect(plan).toEqual({ remove: [], reduce: [] });
    expect(cleanupNotice(plan)).toBeNull();
  });
});

describe('cleanupNotice', () => {
  it('lists what was removed and reduced', () => {
    const plan = planCartCleanup([
      line('x', { stock: 0 }),
      line('y', { isActive: false }),
      line('z', { quantity: 3, stock: 1 }),
    ]);
    expect(cleanupNotice(plan)).toBe(
      'We removed X and Y. Quantity of Z reduced to 1, only 1 in stock.',
    );
  });

  it('handles removals only, reductions only and three removals', () => {
    expect(cleanupNotice(planCartCleanup([line('a', { stock: 0 })]))).toBe('We removed A.');
    expect(cleanupNotice(planCartCleanup([line('b', { quantity: 4, stock: 2 })]))).toBe(
      'Quantity of B reduced to 2, only 2 in stock.',
    );
    expect(
      cleanupNotice(
        planCartCleanup([
          line('a', { stock: 0 }),
          line('b', { stock: 0 }),
          line('c', { stock: 0 }),
        ]),
      ),
    ).toBe('We removed A, B and C.');
  });
});
