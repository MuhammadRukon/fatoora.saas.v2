/**
 * Live-DB concurrency tests for checkoutService.placeOrder. Assert
 * invariants only, never which concurrent caller wins.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import type { CheckoutInput } from '@/contracts/checkout';
import { BadRequestError, ConflictError, statusFromError } from '@/server/common/errors';

import { checkoutService } from '../checkout.service';
import { cleanupCheckoutFixtures, createCheckoutFixture } from './fixtures';

const TEST_TIMEOUT = 60_000;

afterEach(async () => {
  await cleanupCheckoutFixtures();
}, TEST_TIMEOUT);

function input(addressId: string, couponCode?: string): CheckoutInput {
  return { addressId, paymentMethod: 'COD', ...(couponCode ? { couponCode } : {}) };
}

describe('checkoutService.placeOrder concurrency', () => {
  it(
    'two users racing for the last unit: exactly one order, stock never negative',
    async () => {
      const fx = await createCheckoutFixture({ stock: 1, cartQty: 1 });
      const second = await fx.addShopper(1);

      const results = await Promise.allSettled([
        checkoutService.placeOrder(fx.user.id, input(fx.address.id)),
        checkoutService.placeOrder(second.user.id, input(second.address.id)),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const err = rejected[0].reason;
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.meta?.variantId).toBe(fx.variant.id);
      expect(err.meta?.productName).toBe(fx.product.name);

      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: fx.variant.id },
      });
      expect(variant.stock).toBe(0);
      expect(await prisma.orderItem.count({ where: { variantId: fx.variant.id } })).toBe(1);

      const loserId = results[0].status === 'rejected' ? fx.user.id : second.user.id;
      expect(await prisma.order.count({ where: { userId: loserId } })).toBe(0);
      expect(await prisma.cartItem.count({ where: { cart: { userId: loserId } } })).toBe(1);
    },
    TEST_TIMEOUT,
  );

  it(
    'same user double submit: exactly one order, single decrement, cart empty',
    async () => {
      const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

      const results = await Promise.allSettled([
        checkoutService.placeOrder(fx.user.id, input(fx.address.id)),
        checkoutService.placeOrder(fx.user.id, input(fx.address.id)),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      // Loser is a ConflictError (cart-consumption guard) or, if it read after
      // the winner committed, BadRequestError('Cart is empty').
      const loser = rejected[0].reason;
      expect(loser instanceof ConflictError || loser instanceof BadRequestError).toBe(true);

      expect(await prisma.order.count({ where: { userId: fx.user.id } })).toBe(1);
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: fx.variant.id },
      });
      expect(variant.stock).toBe(4);
      expect(await prisma.cartItem.count({ where: { cart: { userId: fx.user.id } } })).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'same user, coupon perUserLimit 1, concurrent submits: coupon used once',
    async () => {
      const fx = await createCheckoutFixture({ stock: 5, cartQty: 1, couponPerUserLimit: 1 });
      const coupon = fx.coupon!;

      const results = await Promise.allSettled([
        checkoutService.placeOrder(fx.user.id, input(fx.address.id, coupon.code)),
        checkoutService.placeOrder(fx.user.id, input(fx.address.id, coupon.code)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

      expect(await prisma.order.count({ where: { userId: fx.user.id, couponId: coupon.id } })).toBe(
        1,
      );
      const after = await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
      expect(after.usedCount).toBe(1);
    },
    TEST_TIMEOUT,
  );
});

describe('checkoutService.placeOrder lock ordering', () => {
  it(
    'opposite cart item order over the same two variants: one wins, loser gets ConflictError, no deadlock',
    async () => {
      const fx = await createCheckoutFixture({ stock: 1, cartQty: 1 });
      const variantA = fx.variant;
      const variantB = await fx.addVariant(1);
      // fx.user's cart is [A]; add B so it reads [A, B].
      await prisma.cartItem.create({
        data: { cartId: fx.cart.id, variantId: variantB.id, quantity: 1 },
      });
      const second = await fx.addShopperWithItems([
        { variantId: variantB.id, quantity: 1 },
        { variantId: variantA.id, quantity: 1 },
      ]);

      const results = await Promise.allSettled([
        checkoutService.placeOrder(fx.user.id, input(fx.address.id)),
        checkoutService.placeOrder(second.user.id, input(second.address.id)),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);

      for (const v of [variantA, variantB]) {
        expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(
          0,
        );
      }
    },
    TEST_TIMEOUT,
  );
});

describe('checkoutService.placeOrder sequential', () => {
  it(
    'second placeOrder after success rejects with "Cart is empty"',
    async () => {
      const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
      await checkoutService.placeOrder(fx.user.id, input(fx.address.id));

      const err = await checkoutService
        .placeOrder(fx.user.id, input(fx.address.id))
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestError);
      expect(err.message).toBe('Cart is empty');
    },
    TEST_TIMEOUT,
  );

  it(
    'cart quantity above stock rejects with a 409 ConflictError carrying meta',
    async () => {
      const fx = await createCheckoutFixture({ stock: 1, cartQty: 3 });

      const err = await checkoutService
        .placeOrder(fx.user.id, input(fx.address.id))
        .catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.code).toBe('CONFLICT');
      expect(statusFromError(err)).toBe(409);
      expect(err.meta?.variantId).toBe(fx.variant.id);
      expect(err.meta?.productName).toBe(fx.product.name);
      expect(err.meta?.reason).toBe('insufficient_stock');
    },
    TEST_TIMEOUT,
  );
});

describe('checkoutService.cancelOrphanedOrder concurrency', () => {
  it(
    'two concurrent calls: both resolve, stock restored once, coupon released once',
    async () => {
      const fx = await createCheckoutFixture({ stock: 5, cartQty: 2, couponPerUserLimit: 1 });
      const coupon = fx.coupon!;
      const { order } = await checkoutService.placeOrder(
        fx.user.id,
        input(fx.address.id, coupon.code),
      );
      expect(
        (await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variant.id } })).stock,
      ).toBe(3);
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(
        1,
      );

      const results = await Promise.allSettled([
        checkoutService.cancelOrphanedOrder(order.id),
        checkoutService.cancelOrphanedOrder(order.id),
      ]);
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);

      expect(
        (await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variant.id } })).stock,
      ).toBe(5);
      expect((await prisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).usedCount).toBe(
        0,
      );
      expect(
        await prisma.orderEvent.count({ where: { orderId: order.id, status: 'CANCELLED' } }),
      ).toBe(1);
    },
    TEST_TIMEOUT,
  );
});
