import { describe, expect, it } from 'vitest';

import { hydrateBodySchema } from '@/contracts/cart';
import { productListQuerySchema } from '@/contracts/catalog';

describe('input caps', () => {
  it('accepts q of 100 chars and rejects 101', () => {
    expect(productListQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
    expect(productListQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
  });

  it('bounds guest cart variantId at 64 chars', () => {
    const line = (id: string) => ({ variantId: id, quantity: 1 });
    expect(hydrateBodySchema.safeParse({ lines: [line('c'.repeat(25))] }).success).toBe(true);
    expect(hydrateBodySchema.safeParse({ lines: [line('c'.repeat(65))] }).success).toBe(false);
  });

  it('accepts 50 hydrate lines and rejects 51', () => {
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ variantId: `v${i}`, quantity: 1 }));
    expect(hydrateBodySchema.safeParse({ lines: lines(50) }).success).toBe(true);
    expect(hydrateBodySchema.safeParse({ lines: lines(51) }).success).toBe(false);
  });
});
