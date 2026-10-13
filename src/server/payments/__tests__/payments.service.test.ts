/**
 * Live-DB tests (same tradeoff as rate-limit.test.ts: no Prisma-mocking
 * convention exists in this repo, so these run against the DATABASE_URL
 * database). Fixtures are randomised per test and cleaned up after.
 */
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';

import { paymentsService } from '../payments.service';

const TEST_TIMEOUT = 60_000;

const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];
const createdProductIds: string[] = [];
const createdBrandIds: string[] = [];

async function createPendingPaymentFixture() {
  const suffix = Math.random().toString(36).slice(2, 10);
  const stock = 5;
  const quantity = 2;
  const totalCents = 200_000;

  const user = await prisma.user.create({
    data: { email: `payments-test-${suffix}@example.com`, name: 'Payments Test' },
  });
  createdUserIds.push(user.id);

  const address = await prisma.address.create({
    data: {
      userId: user.id,
      recipientName: 'Payments Test',
      recipientPhone: '01700000000',
      line1: 'Test Lane 1',
      city: 'Dhaka',
    },
  });

  const brand = await prisma.brand.create({
    data: { slug: `payments-test-brand-${suffix}`, name: `Payments Test Brand ${suffix}` },
  });
  createdBrandIds.push(brand.id);

  const product = await prisma.product.create({
    data: {
      slug: `payments-test-product-${suffix}`,
      name: 'Payments Test Product',
      description: 'test fixture',
      brandId: brand.id,
    },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `PAYMENTS-TEST-${suffix}`,
      buyingPriceCents: 50_000,
      sellingPriceCents: 100_000,
      stock,
    },
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: `PAYMENTS-TEST-${suffix}`,
      userId: user.id,
      addressId: address.id,
      status: OrderStatus.PENDING,
      shipRecipient: 'Payments Test',
      shipPhone: '01700000000',
      shipLine1: 'Test Lane 1',
      shipCity: 'Dhaka',
      shipCountry: 'BD',
      subtotalCents: totalCents,
      totalCents,
      items: {
        create: [
          {
            variantId: variant.id,
            productId: product.id,
            productName: 'Payments Test Product',
            sku: variant.sku,
            buyingPriceCents: 50_000,
            unitPriceCents: 100_000,
            quantity,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: PaymentMethod.SSLCOMMERZ,
      status: PaymentStatus.PENDING,
      amountCents: totalCents,
    },
  });

  return { order, payment, variant, quantity, stock, totalCents, suffix };
}

afterEach(async () => {
  // Orders cascade their items/payments; products cascade variants;
  // users cascade addresses. Orders reference User/Address, so they go first.
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds.splice(0) } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds.splice(0) } } });
  await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds.splice(0) } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
}, TEST_TIMEOUT);

describe('paymentsService.applyCallback', () => {
  it(
    'confirms the order on a SUCCEEDED callback with a matching amount',
    async () => {
      const { order, payment, totalCents, suffix } = await createPendingPaymentFixture();

      const applied = await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, {
        paymentId: payment.id,
        status: PaymentStatus.SUCCEEDED,
        providerRef: `ref-ok-${suffix}`,
        rawPayload: {},
        verifiedAmountCents: totalCents,
      });

      expect(applied.status).toBe(PaymentStatus.SUCCEEDED);
      const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(refreshedOrder.status).toBe(OrderStatus.CONFIRMED);
    },
    TEST_TIMEOUT,
  );

  it(
    'rejects a SUCCEEDED callback whose verified amount mismatches: payment FAILED, stock restored, order stays PENDING',
    async () => {
      const { order, payment, variant, quantity, stock, totalCents, suffix } =
        await createPendingPaymentFixture();

      const applied = await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, {
        paymentId: payment.id,
        status: PaymentStatus.SUCCEEDED,
        providerRef: `ref-mismatch-${suffix}`,
        rawPayload: {},
        verifiedAmountCents: totalCents - 100_000, // attacker paid half
      });

      expect(applied.status).toBe(PaymentStatus.FAILED);

      const refreshedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(refreshedOrder.status).toBe(OrderStatus.PENDING);

      const refreshedVariant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      expect(refreshedVariant.stock).toBe(stock + quantity);

      const events = await prisma.orderEvent.findMany({ where: { orderId: order.id } });
      expect(events.some((e) => e.note?.includes('amount mismatch'))).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'is idempotent: a second callback on a terminal payment is a no-op',
    async () => {
      const { payment, variant, stock, quantity, suffix } = await createPendingPaymentFixture();

      await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, {
        paymentId: payment.id,
        status: PaymentStatus.FAILED,
        providerRef: `ref-first-${suffix}`,
        rawPayload: {},
      });

      // Replay: must not restock again or change status.
      const replayed = await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, {
        paymentId: payment.id,
        status: PaymentStatus.SUCCEEDED,
        providerRef: `ref-replay-${suffix}`,
        rawPayload: {},
      });
      expect(replayed.status).toBe(PaymentStatus.FAILED);

      const refreshedVariant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      expect(refreshedVariant.stock).toBe(stock + quantity);
    },
    TEST_TIMEOUT,
  );
});
