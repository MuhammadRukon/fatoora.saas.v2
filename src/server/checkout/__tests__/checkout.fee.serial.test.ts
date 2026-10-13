/**
 * Live-DB tests for the COD confirmation fee, payment-method enforcement and
 * the customer txn id in `checkoutService`. These read/write the shared
 * PaymentSettings singleton, so this file runs in the serial vitest project
 * (see vitest.config.ts). Every test sets the settings it needs explicitly;
 * `cleanupCheckoutFixtures` restores the original row.
 */
import { CodFeeStatus, CodFeeType, OrderStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CheckoutInput } from '@/contracts/checkout';
import { prisma } from '@/lib/prisma';
import { BadRequestError, TxnIdDuplicateError, statusFromError } from '@/server/common/errors';

import { checkoutService } from '../checkout.service';
import {
  cleanupCheckoutFixtures,
  clearGatewayEnv,
  createCheckoutFixture,
  deletePaymentSettings,
  eventsFor,
  setPaymentSettings,
} from './fixtures';

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupCheckoutFixtures();
});

const FEE_ON = {
  codFeeEnabled: true,
  codFeeType: CodFeeType.FLAT,
  codFeeValue: 10_000,
  contactNumber: '01800000000',
};

function codInput(addressId: string, extra: Partial<CheckoutInput> = {}): CheckoutInput {
  return { addressId, paymentMethod: 'COD', ...extra };
}

describe('placeOrder: COD confirmation fee', () => {
  it('fee off: auto-confirms exactly as before', async () => {
    await setPaymentSettings({ codFeeEnabled: false });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order, feeRequired } = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id),
    );

    expect(feeRequired).toBe(false);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    expect(row.payments[0].feeStatus).toBe(CodFeeStatus.NONE);
    expect(row.payments[0].feeCents).toBe(0);
    const notes = (await eventsFor(order.id)).map((e) => e.note ?? '');
    expect(notes.some((n) => n.includes('COD order auto-confirmed'))).toBe(true);
  });

  it('flat fee: order stays PENDING, fee snapshotted, amount unchanged, no CONFIRMED event', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order, feeRequired } = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id),
    );

    expect(feeRequired).toBe(true);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    const payment = row.payments[0];
    expect(row.status).toBe(OrderStatus.PENDING);
    expect(payment.feeCents).toBe(10_000);
    expect(payment.feeType).toBe(CodFeeType.FLAT);
    expect(payment.feeValue).toBe(10_000);
    expect(payment.feeStatus).toBe(CodFeeStatus.PENDING);
    expect(payment.amountCents).toBe(row.totalCents);

    const events = await eventsFor(order.id);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.status === OrderStatus.PENDING)).toBe(true);
    expect(events.map((e) => e.note).sort()).toEqual(
      ['COD confirmation fee pending', 'Order placed'].sort(),
    );
    expect(events.some((e) => e.status === OrderStatus.CONFIRMED)).toBe(false);
  });

  it('writes the order events in placement order with strictly increasing timestamps', async () => {
    await setPaymentSettings(FEE_ON);
    const feeFx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    const fee = await checkoutService.placeOrder(feeFx.user.id, codInput(feeFx.address.id));
    const feeEvents = await eventsFor(fee.order.id);
    expect(feeEvents.map((e) => [e.status, e.note])).toEqual([
      [OrderStatus.PENDING, 'Order placed'],
      [OrderStatus.PENDING, 'COD confirmation fee pending'],
    ]);

    await setPaymentSettings({ codFeeEnabled: false });
    const autoFx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    const auto = await checkoutService.placeOrder(autoFx.user.id, codInput(autoFx.address.id));
    const autoEvents = await eventsFor(auto.order.id);
    expect(autoEvents.map((e) => [e.status, e.note])).toEqual([
      [OrderStatus.PENDING, 'Order placed'],
      [OrderStatus.CONFIRMED, 'COD order auto-confirmed; awaiting fulfilment'],
    ]);

    for (const events of [feeEvents, autoEvents]) {
      expect(events[1].createdAt.getTime()).toBeGreaterThan(events[0].createdAt.getTime());
    }
  });

  it('percent fee rounds up to the next 10 BDT (total 49840 -> 13000)', async () => {
    await setPaymentSettings({ ...FEE_ON, codFeeType: CodFeeType.PERCENT, codFeeValue: 25 });
    // 43840 + 6000 Dhaka shipping = 49840
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1, unitPriceCents: 43_840 });

    const { order } = await checkoutService.placeOrder(fx.user.id, codInput(fx.address.id));

    expect(order.totalCents).toBe(49_840);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.feeCents).toBe(13_000);
    expect(payment.feeType).toBe(CodFeeType.PERCENT);
    expect(payment.feeValue).toBe(25);
  });

  it('caps the fee at the order total (total 6000, flat 10000 -> 6000)', async () => {
    await setPaymentSettings(FEE_ON);
    // Free item + 6000 Dhaka shipping = 6000
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1, unitPriceCents: 0 });

    const { order } = await checkoutService.placeOrder(fx.user.id, codInput(fx.address.id));

    expect(order.totalCents).toBe(6_000);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.feeCents).toBe(6_000);
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('snapshots the rule: later settings changes do not alter a placed order', async () => {
    await setPaymentSettings({ ...FEE_ON, codFeeType: CodFeeType.PERCENT, codFeeValue: 25 });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1, unitPriceCents: 43_840 });
    const { order } = await checkoutService.placeOrder(fx.user.id, codInput(fx.address.id));
    const before = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

    await setPaymentSettings({ ...FEE_ON, codFeeType: CodFeeType.FLAT, codFeeValue: 5_000 });

    const after = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(after.feeType).toBe(CodFeeType.PERCENT);
    expect(after.feeValue).toBe(25);
    expect(after.feeCents).toBe(before.feeCents);
    expect(after.feeCents).toBe(13_000);
  });

  it('missing settings row: COD succeeds on defaults (auto-confirmed, no fee)', async () => {
    await deletePaymentSettings();
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order } = await checkoutService.placeOrder(fx.user.id, codInput(fx.address.id));

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    expect(row.payments[0].feeCents).toBe(0);
  });
});

describe('placeOrder: payment method enforcement', () => {
  async function expectRejectedUntouched(
    fx: Awaited<ReturnType<typeof createCheckoutFixture>>,
    paymentMethod: CheckoutInput['paymentMethod'],
  ) {
    const err = await checkoutService
      .placeOrder(fx.user.id, { addressId: fx.address.id, paymentMethod })
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.meta).toEqual({ reason: 'payment_method_unavailable', method: paymentMethod });

    expect(await prisma.order.count({ where: { userId: fx.user.id } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { cart: { userId: fx.user.id } } })).toBe(1);
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variant.id } });
    expect(variant.stock).toBe(5);
  }

  it('BKASH not enabled: BKASH is rejected, nothing created or consumed', async () => {
    clearGatewayEnv();
    await setPaymentSettings({ enabledMethods: ['COD'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await expectRejectedUntouched(fx, 'BKASH');
  });

  it('BKASH enabled without credentials is rejected the same way', async () => {
    clearGatewayEnv();
    await setPaymentSettings({ enabledMethods: ['COD', 'BKASH'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await expectRejectedUntouched(fx, 'BKASH');
  });

  it('COD not enabled: COD is rejected', async () => {
    clearGatewayEnv();
    await setPaymentSettings({ enabledMethods: ['BANK_TRANSFER'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await expectRejectedUntouched(fx, 'COD');
  });

  it('an enabled non-COD method is allowed and gets no fee', async () => {
    await setPaymentSettings({ ...FEE_ON, enabledMethods: ['COD', 'BANK_TRANSFER'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order, feeRequired } = await checkoutService.placeOrder(fx.user.id, {
      addressId: fx.address.id,
      paymentMethod: 'BANK_TRANSFER',
    });

    expect(feeRequired).toBe(false);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { payments: true },
    });
    expect(row.status).toBe(OrderStatus.PENDING);
    expect(row.payments[0].feeCents).toBe(0);
    expect(row.payments[0].feeStatus).toBe(CodFeeStatus.NONE);
  });
});

describe('placeOrder: customer transaction id', () => {
  it('stores a messy id normalized (trim + uppercase) with txnSubmittedAt', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order } = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id, { customerTxnId: ' abc12345 ' }),
    );

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.customerTxnId).toBe('ABC12345');
    expect(payment.txnSubmittedAt).not.toBeNull();
  });

  it('a duplicate id throws TXN_ID_DUPLICATE, creates no order, leaves the cart intact', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    const other = await fx.addShopper(1);
    const first = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id, { customerTxnId: 'DUP123456' }),
    );

    const err = await checkoutService
      .placeOrder(other.user.id, codInput(other.address.id, { customerTxnId: 'dup123456' }))
      .catch((e) => e);

    expect(err).toBeInstanceOf(TxnIdDuplicateError);
    expect(err.code).toBe('TXN_ID_DUPLICATE');
    expect(statusFromError(err)).toBe(409);
    expect(err.meta).toBeUndefined();
    expect(err.message).not.toContain(first.order.orderNumber);
    expect(await prisma.order.count({ where: { userId: other.user.id } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { cart: { userId: other.user.id } } })).toBe(1);
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { id: fx.variant.id },
    });
    expect(variant.stock).toBe(4);
  });

  it('concurrent orders with the same id: exactly one wins, the loser gets TXN_ID_DUPLICATE', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 100, cartQty: 1 });
    const ROUNDS = 8;
    let winners = 0;

    for (let round = 0; round < ROUNDS; round++) {
      const a = await fx.addShopper(1);
      const b = await fx.addShopper(1);
      const txnId = `RACE${round}${Date.now().toString(36)}`.toUpperCase();
      const stockBefore = (
        await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variant.id } })
      ).stock;

      // Both calls start in the same tick so their transactions overlap: the
      // loser either hits the pre-check (winner already committed) or the
      // unique index itself (winner uncommitted), and must map to the same error.
      const results = await Promise.allSettled([
        checkoutService.placeOrder(a.user.id, codInput(a.address.id, { customerTxnId: txnId })),
        checkoutService.placeOrder(b.user.id, codInput(b.address.id, { customerTxnId: txnId })),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(TxnIdDuplicateError);
      expect(rejected[0].reason.code).toBe('TXN_ID_DUPLICATE');
      winners += fulfilled.length;

      const winnerIdx = results[0].status === 'fulfilled' ? 0 : 1;
      const [winner, loser] = winnerIdx === 0 ? [a, b] : [b, a];
      expect(await prisma.order.count({ where: { userId: winner.user.id } })).toBe(1);
      expect(await prisma.order.count({ where: { userId: loser.user.id } })).toBe(0);
      expect(await prisma.payment.count({ where: { customerTxnId: txnId } })).toBe(1);
      expect(await prisma.cartItem.count({ where: { cart: { userId: loser.user.id } } })).toBe(1);
      const variant = await prisma.productVariant.findUniqueOrThrow({
        where: { id: fx.variant.id },
      });
      expect(variant.stock).toBe(stockBefore - 1);
    }
    expect(winners).toBe(ROUNDS);
  });

  it('fee off: a supplied txn id is ignored (customerTxnId stays NULL)', async () => {
    await setPaymentSettings({ codFeeEnabled: false });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const { order } = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id, { customerTxnId: 'ABC12345' }),
    );

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.customerTxnId).toBeNull();
    expect(payment.txnSubmittedAt).toBeNull();
  });
});

describe('checkoutService.quote: COD fee', () => {
  it('COD with the fee on returns fee, due-on-delivery and rule; total unchanged', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    const quote = await checkoutService.quote({
      userId: fx.user.id,
      addressId: fx.address.id,
      paymentMethod: 'COD',
    });

    expect(quote.codFeeCents).toBe(10_000);
    expect(quote.dueOnDeliveryCents).toBe(quote.totalCents - 10_000);
    expect(quote.codFeeRule).toEqual({ type: CodFeeType.FLAT, value: 10_000 });
  });

  it('omitting paymentMethod, or BANK_TRANSFER, returns no fee', async () => {
    await setPaymentSettings({ ...FEE_ON, enabledMethods: ['COD', 'BANK_TRANSFER'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    const base = { userId: fx.user.id, addressId: fx.address.id };

    for (const paymentMethod of [undefined, 'BANK_TRANSFER' as const]) {
      const quote = await checkoutService.quote({ ...base, paymentMethod });
      expect(quote.codFeeCents).toBe(0);
      expect(quote.dueOnDeliveryCents).toBe(quote.totalCents);
      expect(quote.codFeeRule).toBeNull();
    }
  });

  it('rejects a method that is not currently enabled', async () => {
    clearGatewayEnv();
    await setPaymentSettings({ enabledMethods: ['COD', 'BKASH'] });
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });

    await expect(
      checkoutService.quote({
        userId: fx.user.id,
        addressId: fx.address.id,
        paymentMethod: 'BKASH',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('quote total equals placeOrder total for the same cart', async () => {
    await setPaymentSettings(FEE_ON);
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 2, couponPerUserLimit: 1 });
    const code = fx.coupon!.code;

    const quote = await checkoutService.quote({
      userId: fx.user.id,
      addressId: fx.address.id,
      couponCode: code,
      paymentMethod: 'COD',
    });
    const { order } = await checkoutService.placeOrder(
      fx.user.id,
      codInput(fx.address.id, { couponCode: code }),
    );

    expect(order.totalCents).toBe(quote.totalCents);
    expect(order.payments[0].feeCents).toBe(quote.codFeeCents);
  });
});
