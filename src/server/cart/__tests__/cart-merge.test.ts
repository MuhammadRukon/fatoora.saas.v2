import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  cart: { findUnique: vi.fn(), upsert: vi.fn() },
  cartItem: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  productVariant: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { cartService } from '@/server/cart/cart.service';

const variant = (
  id: string,
  stock: number,
  over: { isActive?: boolean; status?: string } = {},
) => ({
  id,
  stock,
  isActive: over.isActive ?? true,
  product: { status: over.status ?? 'PUBLISHED', name: `Product ${id}` },
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.cart.upsert.mockResolvedValue({ id: 'c1' });
  prisma.cart.findUnique.mockResolvedValue({ id: 'c1' });
  prisma.cartItem.findMany.mockResolvedValue([]);
  prisma.$transaction.mockResolvedValue([]);
  prisma.$queryRaw.mockResolvedValue([]);
});

describe('mergeGuestCart adjustments', () => {
  it('reports removed (applied 0) and clamped (applied < requested) lines, snapshot at top level', async () => {
    prisma.productVariant.findMany.mockResolvedValue([
      variant('ok', 10),
      variant('sold-out', 0),
      variant('inactive', 5, { isActive: false }),
      variant('draft', 5, { status: 'DRAFT' }),
      variant('low', 2),
    ]);
    const result = await cartService.mergeGuestCart('u1', [
      { variantId: 'ok', quantity: 3 },
      { variantId: 'sold-out', quantity: 1 },
      { variantId: 'inactive', quantity: 2 },
      { variantId: 'draft', quantity: 1 },
      { variantId: 'gone', quantity: 4 },
      { variantId: 'low', quantity: 5 },
    ]);

    expect(result).toMatchObject({ lines: [], subtotalCents: 0, itemCount: 0 });
    expect(result.adjustments).toEqual([
      { variantId: 'sold-out', name: 'Product sold-out', requested: 1, applied: 0 },
      { variantId: 'inactive', name: 'Product inactive', requested: 2, applied: 0 },
      { variantId: 'draft', name: 'Product draft', requested: 1, applied: 0 },
      { variantId: 'gone', requested: 4, applied: 0 },
      { variantId: 'low', name: 'Product low', requested: 5, applied: 2 },
    ]);
  });

  it('counts only what the guest added on top of the existing server quantity', async () => {
    prisma.productVariant.findMany.mockResolvedValue([variant('v', 5)]);
    prisma.cartItem.findMany.mockResolvedValue([{ id: 'i1', variantId: 'v', quantity: 4 }]);
    const result = await cartService.mergeGuestCart('u1', [{ variantId: 'v', quantity: 3 }]);
    expect(result.adjustments).toEqual([
      { variantId: 'v', name: 'Product v', requested: 3, applied: 1 },
    ]);
  });

  it('fully applied lines and an empty guest cart yield no adjustments', async () => {
    prisma.productVariant.findMany.mockResolvedValue([variant('v', 5)]);
    expect(
      (await cartService.mergeGuestCart('u1', [{ variantId: 'v', quantity: 2 }])).adjustments,
    ).toEqual([]);
    expect((await cartService.mergeGuestCart('u1', [])).adjustments).toEqual([]);
  });
});
