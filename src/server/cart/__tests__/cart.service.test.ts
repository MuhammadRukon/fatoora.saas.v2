import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  cart: { findUnique: vi.fn(), upsert: vi.fn() },
  cartItem: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  productVariant: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { cartService } from '@/server/cart/cart.service';

beforeEach(() => vi.resetAllMocks());

describe('cart reads do not write', () => {
  it('getCartSummary with no cart returns zeros and never upserts', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);
    await expect(cartService.getCartSummary('u1')).resolves.toEqual({
      subtotalCents: 0,
      itemCount: 0,
      hasIssues: false,
    });
    expect(prisma.cart.findUnique).toHaveBeenCalledWith({ where: { userId: 'u1' } });
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
  });

  it('getCart with no cart returns an empty snapshot and never upserts', async () => {
    prisma.cart.findUnique.mockResolvedValue(null);
    await expect(cartService.getCart('u1')).resolves.toEqual({
      lines: [],
      subtotalCents: 0,
      itemCount: 0,
    });
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('first addItem still creates the cart exactly once', async () => {
    prisma.cart.upsert.mockResolvedValue({ id: 'c1' });
    prisma.cart.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.cartItem.findUnique.mockResolvedValue(null);
    prisma.productVariant.findUnique.mockResolvedValue({
      isActive: true,
      stock: 5,
      product: { status: 'PUBLISHED' },
    });
    prisma.$queryRaw.mockResolvedValue([]);
    await cartService.addItem('u1', { variantId: 'v1', quantity: 1 });
    expect(prisma.cart.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.cartItem.create).toHaveBeenCalledWith({
      data: { cartId: 'c1', variantId: 'v1', quantity: 1 },
    });
  });
});
