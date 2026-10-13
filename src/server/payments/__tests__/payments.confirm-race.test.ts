/**
 * Live-DB tests for the order-confirmation compare-and-set shared by
 * `paymentsService.verify` (admin) and `paymentsService.applyCallback`
 * (gateway): a confirm must lose cleanly to a concurrent cancel instead of
 * flipping a CANCELLED order back to CONFIRMED.
 *
 * Orders/payments are hand-built via `createManualOrder`, so these never
 * touch the PaymentSettings singleton.
 */
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { ConflictError } from '@/server/common/errors';
import { sendMail } from '@/server/common/mailer';
import {
  cleanupCheckoutFixtures,
  createAdminUser,
  createCheckoutFixture,
  createManualOrder,
  eventsFor,
} from '@/server/checkout/__tests__/fixtures';
import {
  cancelOrderInTx,
  ordersService,
  restockOrderItems,
} from '@/server/orders/orders.service';

import { paymentsService } from '../payments.service';

// Never send mail from tests, and let them count how many a callback would send.
vi.mock('@/server/common/mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/common/mailer')>()),
  sendMail: vi.fn(async () => {}),
}));

const ROUNDS = 8;

/**
 * Starts `a` and `b` in (nearly) the same tick, with a random 0-12 ms head
 * start for one side, so across rounds each side wins sometimes.
 */
function raceStaggered<A, B>(a: () => Promise<A>, b: () => Promise<B>) {
  const aDelay = Math.random() < 0.5 ? Math.random() * 12 : 0;
  const bDelay = aDelay === 0 ? Math.random() * 12 : 0;
  const later = <T>(ms: number, fn: () => Promise<T>) =>
    ms === 0 ? fn() : new Promise<T>((r) => setTimeout(r, ms)).then(fn);
  return Promise.allSettled([later(aDelay, a), later(bDelay, b)]) as Promise<
    [PromiseSettledResult<A>, PromiseSettledResult<B>]
  >;
}

beforeEach(() => {
  vi.mocked(sendMail).mockClear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupCheckoutFixtures();
});

function bankOrder(overrides: Parameters<typeof createManualOrder>[0] = {}) {
  return createManualOrder({ method: PaymentMethod.BANK_TRANSFER, ...overrides });
}

function gatewayOrder(overrides: Parameters<typeof createManualOrder>[0] = {}) {
  return createManualOrder({ method: PaymentMethod.SSLCOMMERZ, ...overrides });
}

function succeeded(paymentId: string, ref = 'ref') {
  return {
    paymentId,
    status: PaymentStatus.SUCCEEDED,
    providerRef: `${ref}-${paymentId}`,
    rawPayload: {},
  };
}

/**
 * Holds an open transaction that has cancelled the order (row locked, not yet
 * committed), starts `action`, then commits. The action reads the order as
 * still PENDING and only then blocks on the order row, so an unguarded
 * `order.update` would flip the CANCELLED order back to CONFIRMED.
 */
async function actionRacingCancel(orderId: string, action: () => Promise<unknown>) {
  let pending: Promise<unknown> = Promise.resolve();
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true },
    });
    const ok = await cancelOrderInTx(tx, order, {
      reason: 'race',
      event: { note: 'cancelled in race test' },
    });
    expect(ok).toBe(true);
    pending = action().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    // Let the action run up to its (blocked) order claim.
    await new Promise((r) => setTimeout(r, 400));
  });
  return (await pending) as { value?: unknown; error?: unknown };
}

/** The audit note applyCallback writes when money arrives for a non-pending order. */
function isAuditEvent(e: { note: string | null }) {
  return !!e.note?.endsWith('review or refund');
}
function auditEvents<T extends { note: string | null }>(events: T[]) {
  return events.filter(isAuditEvent);
}

function failed(paymentId: string, ref = 'ref') {
  return {
    paymentId,
    status: PaymentStatus.FAILED,
    providerRef: `${ref}-${paymentId}`,
    rawPayload: {},
  };
}

/** Warn-level structured log lines emitted while the spy was installed. */
function warnMessages(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])).message as string);
}

describe('paymentsService.verify racing an order cancel', () => {
  it('loses to a cancel that holds the order row: ConflictError, payment stays PENDING, order stays CANCELLED', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await bankOrder();

    const res = await actionRacingCancel(order.id, () =>
      paymentsService.verify(admin.id, payment.id, 'SUCCEEDED'),
    );

    expect(res.error).toBeInstanceOf(ConflictError);
    expect((res.error as Error).message).toBe('Order is no longer pending');
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.status).toBe(PaymentStatus.PENDING);
    expect(pay.verifiedById).toBeNull();
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CANCELLED);
    const events = await eventsFor(order.id);
    expect(events.some((e) => e.status === OrderStatus.CONFIRMED)).toBe(false);
  });

  it(`never leaves a CONFIRMED-after-CANCELLED order (${ROUNDS} concurrent rounds)`, async () => {
    const admin = await createAdminUser();
    const tally = { verifyWon: 0, cancelWon: 0, serial: 0 };

    for (let round = 0; round < ROUNDS; round++) {
      const { userId, order, payment } = await bankOrder();

      const [verified, cancelled] = await raceStaggered(
        () => paymentsService.verify(admin.id, payment.id, 'SUCCEEDED'),
        () => ordersService.cancelByCustomer(userId, order.id, 'race'),
      );

      // Exactly one side may fail, and only with the conflict (never a crash).
      for (const r of [verified, cancelled]) {
        if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictError);
      }
      expect([verified, cancelled].some((r) => r.status === 'fulfilled')).toBe(true);

      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const events = await eventsFor(order.id);

      // The payment status is exactly the verify outcome.
      expect(pay.status).toBe(
        verified.status === 'fulfilled' ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
      );
      // A cancel that succeeded is final: the order can never end CONFIRMED
      // after it (event timestamps are transaction-start times, so the
      // outcome, not event order, is what proves the sequence).
      expect(row.status).toBe(
        cancelled.status === 'fulfilled' ? OrderStatus.CANCELLED : OrderStatus.CONFIRMED,
      );
      expect(events.filter((e) => e.status === OrderStatus.CANCELLED)).toHaveLength(
        cancelled.status === 'fulfilled' ? 1 : 0,
      );
      expect(events.filter((e) => e.status === OrderStatus.CONFIRMED)).toHaveLength(
        verified.status === 'fulfilled' ? 1 : 0,
      );

      if (verified.status === 'fulfilled' && cancelled.status === 'fulfilled') tally.serial++;
      else if (verified.status === 'fulfilled') tally.verifyWon++;
      else tally.cancelWon++;
    }
    // Surfaced in the test output so the evidence shows the race was exercised.
    console.info('verify-vs-cancel rounds', JSON.stringify(tally));
  });

  it('two concurrent verifies (SUCCEEDED vs FAILED): exactly one wins and the state matches it', async () => {
    const admin = await createAdminUser();

    for (let round = 0; round < ROUNDS; round++) {
      const { order, payment } = await bankOrder();

      const [ok, rejected] = await Promise.allSettled([
        paymentsService.verify(admin.id, payment.id, 'SUCCEEDED'),
        paymentsService.verify(admin.id, payment.id, 'FAILED'),
      ]);

      expect([ok, rejected].filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = [ok, rejected].find((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(loser?.reason).toBeInstanceOf(ConflictError);

      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(pay.status).toBe(ok.status === 'fulfilled' ? 'SUCCEEDED' : 'FAILED');
      expect(row.status).toBe(
        ok.status === 'fulfilled' ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
      );
      expect(await eventsFor(order.id)).toHaveLength(1);
    }
  });
});

describe('paymentsService.verify unchanged paths', () => {
  it('SUCCEEDED on an already-CONFIRMED order: payment SUCCEEDED, order stays CONFIRMED, one admin event', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await bankOrder({ orderStatus: OrderStatus.CONFIRMED });

    const updated = await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED', 'cash in hand');

    expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
    expect(updated.verifiedById).toBe(admin.id);
    expect(updated.verifiedAt).not.toBeNull();
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].note).toBe('cash in hand');
  });

  it('SUCCEEDED on a PENDING order confirms it with one admin-attributed event', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await bankOrder();

    await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED');

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].note).toContain('verified by admin');
  });

  it('FAILED on a PENDING order leaves it PENDING and records the rejection', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await bankOrder();

    const updated = await paymentsService.verify(admin.id, payment.id, 'FAILED');

    expect(updated.status).toBe(PaymentStatus.FAILED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.PENDING);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.PENDING);
    expect(events[0].note).toContain('rejected by admin');
  });

  it('an already-processed payment is a ConflictError', async () => {
    const admin = await createAdminUser();
    const { payment } = await bankOrder();
    await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED');

    await expect(paymentsService.verify(admin.id, payment.id, 'SUCCEEDED')).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('paymentsService.applyCallback confirming the order', () => {
  it('a SUCCEEDED callback racing a cancel: payment SUCCEEDED, order stays CANCELLED, warning logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order, payment } = await gatewayOrder();

    const res = await actionRacingCancel(order.id, () =>
      paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id)),
    );

    // The gateway still gets a clean answer (no error loop)...
    expect(res.error).toBeUndefined();
    expect((res.value as { status: PaymentStatus }).status).toBe(PaymentStatus.SUCCEEDED);
    // ...the payment is recorded, but the cancelled order is not resurrected.
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.status).toBe(PaymentStatus.SUCCEEDED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CANCELLED);
    const events = await eventsFor(order.id);
    expect(events.some((e) => e.status === OrderStatus.CONFIRMED)).toBe(false);
    expect(warnMessages(warn)).toContain('payments.callback.order_not_pending');
    // ...and the timeline shows money arrived on a cancelled order.
    expect(auditEvents(events)).toHaveLength(1);
    expect(auditEvents(events)[0].status).toBe(OrderStatus.CANCELLED);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it(`never leaves a CONFIRMED-after-CANCELLED order (${ROUNDS} concurrent rounds)`, async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tally = { callbackWon: 0, cancelWon: 0, serial: 0 };

    for (let round = 0; round < ROUNDS; round++) {
      const { userId, order, payment } = await gatewayOrder();

      const [callback, cancelled] = await raceStaggered(
        () => paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id)),
        () => ordersService.cancelByCustomer(userId, order.id, 'race'),
      );

      // The callback never errors; the cancel may only lose with the conflict.
      expect(callback.status).toBe('fulfilled');
      if (cancelled.status === 'rejected') expect(cancelled.reason).toBeInstanceOf(ConflictError);

      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const events = await eventsFor(order.id);

      expect(pay.status).toBe(PaymentStatus.SUCCEEDED);
      // A cancel that succeeded is final; a cancel that lost left it CONFIRMED.
      expect(row.status).toBe(
        cancelled.status === 'fulfilled' ? OrderStatus.CANCELLED : OrderStatus.CONFIRMED,
      );
      expect(
        events.filter((e) => e.status === OrderStatus.CANCELLED && !isAuditEvent(e)),
      ).toHaveLength(cancelled.status === 'fulfilled' ? 1 : 0);

      const confirmedEvents = events.filter((e) => e.status === OrderStatus.CONFIRMED).length;
      expect(confirmedEvents).toBeLessThanOrEqual(1);
      if (cancelled.status === 'rejected') expect(confirmedEvents).toBe(1);
      // The audit note exists exactly when the cancel got in before the confirm.
      expect(auditEvents(events)).toHaveLength(
        cancelled.status === 'fulfilled' && confirmedEvents === 0 ? 1 : 0,
      );
      if (cancelled.status === 'fulfilled' && confirmedEvents === 1) tally.serial++;
      else if (cancelled.status === 'fulfilled') tally.cancelWon++;
      else tally.callbackWon++;
    }
    console.info('callback-vs-cancel rounds', JSON.stringify(tally));
  });

  it('on an order that is not PENDING (already CANCELLED): payment recorded, order untouched, warning logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order, payment } = await gatewayOrder({ orderStatus: OrderStatus.CANCELLED });

    const applied = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      succeeded(payment.id),
    );

    expect(applied.status).toBe(PaymentStatus.SUCCEEDED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CANCELLED);
    // Only the audit note: no CONFIRMED event, no actor.
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CANCELLED);
    expect(events[0].actorId).toBeNull();
    expect(events[0].note).toBe(
      `Payment received via ${PaymentMethod.SSLCOMMERZ} after the order was cancelled; review or refund`,
    );
    expect(warnMessages(warn)).toContain('payments.callback.order_not_pending');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('on an already-CONFIRMED order: one audit note, never a second "Payment received" CONFIRMED event', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order, payment } = await gatewayOrder({ orderStatus: OrderStatus.CONFIRMED });

    const applied = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      succeeded(payment.id),
    );
    // A replay of the same callback is a terminal no-op and adds nothing.
    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id, 'replay'));

    expect(applied.status).toBe(PaymentStatus.SUCCEEDED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(auditEvents(events)).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].note).toBe(
      `Payment received via ${PaymentMethod.SSLCOMMERZ} after the order was confirmed; review or refund`,
    );
    // The confirm note (exact "Payment received via X") was not written.
    expect(
      events.filter((e) => e.note === `Payment received via ${PaymentMethod.SSLCOMMERZ}`),
    ).toHaveLength(0);
    expect(warnMessages(warn)).toContain('payments.callback.order_not_pending');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('on a PENDING order: confirms it with a "Payment received" event and no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order, payment } = await gatewayOrder();

    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id));

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].actorId).toBeNull();
    expect(events[0].note).toBe(`Payment received via ${PaymentMethod.SSLCOMMERZ}`);
    expect(warnMessages(warn)).not.toContain('payments.callback.order_not_pending');
  });

  it('a repeated SUCCEEDED callback is a no-op: one CONFIRMED event, status unchanged', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { order, payment } = await gatewayOrder();

    const first = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      succeeded(payment.id, 'first'),
    );
    const replay = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      succeeded(payment.id, 'replay'),
    );

    expect(first.status).toBe(PaymentStatus.SUCCEEDED);
    expect(replay.status).toBe(PaymentStatus.SUCCEEDED);
    expect(replay.providerRef).toBe(first.providerRef);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    expect(await eventsFor(order.id)).toHaveLength(1);
  });

  it('two concurrent SUCCEEDED callbacks: both resolve, exactly one CONFIRMED event', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let round = 0; round < ROUNDS; round++) {
      const { order, payment } = await gatewayOrder();

      const results = await Promise.allSettled([
        paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id, 'a')),
        paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id, 'b')),
      ]);

      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(row.status).toBe(OrderStatus.CONFIRMED);
      expect(pay.status).toBe(PaymentStatus.SUCCEEDED);
      const events = await eventsFor(order.id);
      expect(events.filter((e) => e.status === OrderStatus.CONFIRMED)).toHaveLength(1);
    }
  });
});

/**
 * The payment write in `applyCallback` is a compare-and-set from PENDING, so a
 * call that loses to another terminal callback rolls back completely (order
 * claim, restock, events) and answers with the payment as it now stands.
 */
describe('paymentsService.applyCallback racing another callback', () => {
  const QTY = 2;
  const STOCK = 50;

  async function setup() {
    const fixture = await createCheckoutFixture({ stock: STOCK, cartQty: 1 });
    async function newOrder() {
      const made = await gatewayOrder();
      await prisma.orderItem.create({
        data: {
          orderId: made.order.id,
          variantId: fixture.variant.id,
          productName: 'Race item',
          sku: `RACE-${made.order.id}`,
          buyingPriceCents: 50_000,
          unitPriceCents: 100_000,
          quantity: QTY,
        },
      });
      return made;
    }
    const stock = async () =>
      (
        await prisma.productVariant.findUniqueOrThrow({
          where: { id: fixture.variant.id },
          select: { stock: true },
        })
      ).stock;
    return { newOrder, stock };
  }

  /** The "stock restored" audit events on an order. */
  const restockEvents = (events: { note: string | null }[]) =>
    events.filter((e) => e.note?.includes('stock restored'));

  /**
   * Holds an open transaction that has already moved the payment to FAILED and
   * restocked (row locked, uncommitted), starts `action` (which still reads
   * the payment as PENDING and then blocks on the payment row), then commits.
   * An unconditional payment write would apply the second outcome on top.
   */
  async function actionRacingFailedWinner(
    orderId: string,
    paymentId: string,
    action: () => Promise<{ status: PaymentStatus }>,
  ) {
    let pending: Promise<unknown> = Promise.resolve();
    await prisma.$transaction(async (tx) => {
      const items = await tx.orderItem.findMany({ where: { orderId } });
      await tx.payment.update({ where: { id: paymentId }, data: { status: PaymentStatus.FAILED } });
      await restockOrderItems(tx, items);
      pending = action().then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await new Promise((r) => setTimeout(r, 400));
    });
    return (await pending) as { value?: { status: PaymentStatus }; error?: unknown };
  }

  it('a FAILED callback that loses to an in-flight FAILED: no second restock, no email, current payment returned', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { newOrder, stock } = await setup();
    const { order, payment } = await newOrder();
    const before = await stock();

    const res = await actionRacingFailedWinner(order.id, payment.id, () =>
      paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, failed(payment.id)),
    );

    expect(res.error).toBeUndefined();
    expect(res.value?.status).toBe(PaymentStatus.FAILED);
    expect(await stock()).toBe(before + QTY); // the winner's restock only
    expect(restockEvents(await eventsFor(order.id))).toHaveLength(0); // loser wrote none
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('a SUCCEEDED callback that loses to an in-flight FAILED: payment stays FAILED, order claim rolled back, no email', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { newOrder, stock } = await setup();
    const { order, payment } = await newOrder();
    const before = await stock();

    const res = await actionRacingFailedWinner(order.id, payment.id, () =>
      paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id)),
    );

    expect(res.error).toBeUndefined();
    expect(res.value?.status).toBe(PaymentStatus.FAILED);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.status).toBe(PaymentStatus.FAILED);
    expect(pay.providerRef).toBeNull();
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.PENDING);
    expect(await eventsFor(order.id)).toHaveLength(0);
    expect(await stock()).toBe(before + QTY);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it(`two concurrent FAILED callbacks restock exactly once (${ROUNDS} rounds)`, async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { newOrder, stock } = await setup();

    for (let round = 0; round < ROUNDS; round++) {
      const { order, payment } = await newOrder();
      const before = await stock();
      vi.mocked(sendMail).mockClear();

      const [a, b] = await raceStaggered(
        () => paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, failed(payment.id, 'a')),
        () => paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, failed(payment.id, 'b')),
      );

      expect([a.status, b.status]).toEqual(['fulfilled', 'fulfilled']);
      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(pay.status).toBe(PaymentStatus.FAILED);
      expect(await stock()).toBe(before + QTY);
      expect(restockEvents(await eventsFor(order.id))).toHaveLength(1);
      expect(sendMail).toHaveBeenCalledTimes(1);
    }
  });

  it(`concurrent SUCCEEDED vs FAILED end consistent, never both (${ROUNDS} rounds)`, async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { newOrder, stock } = await setup();
    const tally = { succeededWon: 0, failedWon: 0 };

    for (let round = 0; round < ROUNDS; round++) {
      const { order, payment } = await newOrder();
      const before = await stock();
      vi.mocked(sendMail).mockClear();

      const [ok, bad] = await raceStaggered(
        () => paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(payment.id)),
        () => paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, failed(payment.id)),
      );

      // Neither side errors: the loser just answers with the winning state.
      expect([ok.status, bad.status]).toEqual(['fulfilled', 'fulfilled']);
      const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const events = await eventsFor(order.id);
      const confirmed = events.filter((e) => e.status === OrderStatus.CONFIRMED);

      if (pay.status === PaymentStatus.SUCCEEDED) {
        tally.succeededWon++;
        expect(row.status).toBe(OrderStatus.CONFIRMED);
        expect(await stock()).toBe(before);
        expect(confirmed).toHaveLength(1);
        expect(restockEvents(events)).toHaveLength(0);
      } else {
        tally.failedWon++;
        expect(pay.status).toBe(PaymentStatus.FAILED);
        expect(row.status).toBe(OrderStatus.PENDING);
        expect(await stock()).toBe(before + QTY);
        expect(confirmed).toHaveLength(0);
        expect(restockEvents(events)).toHaveLength(1);
      }
      // Exactly one customer email, matching the winner; the loser rolled back
      // without leaving an audit note either.
      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(auditEvents(events)).toHaveLength(0);
    }
    console.info('callback SUCCEEDED-vs-FAILED rounds', JSON.stringify(tally));
  });

  it('sequential replays stay no-ops: FAILED then FAILED restocks once; FAILED then SUCCEEDED and SUCCEEDED then FAILED keep the first outcome', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { newOrder, stock } = await setup();

    // FAILED, FAILED
    const one = await newOrder();
    const before = await stock();
    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, failed(one.payment.id, 'x'));
    const again = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      failed(one.payment.id, 'y'),
    );
    expect(again.status).toBe(PaymentStatus.FAILED);
    expect(again.providerRef).toBe(`x-${one.payment.id}`);
    expect(await stock()).toBe(before + QTY);
    expect(restockEvents(await eventsFor(one.order.id))).toHaveLength(1);

    // FAILED, then SUCCEEDED: still FAILED, order not confirmed
    const late = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      succeeded(one.payment.id),
    );
    expect(late.status).toBe(PaymentStatus.FAILED);
    const oneRow = await prisma.order.findUniqueOrThrow({ where: { id: one.order.id } });
    expect(oneRow.status).toBe(OrderStatus.PENDING);

    // SUCCEEDED, then FAILED: still SUCCEEDED, no restock
    const two = await newOrder();
    const beforeTwo = await stock();
    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, succeeded(two.payment.id));
    const flipped = await paymentsService.applyCallback(
      PaymentMethod.SSLCOMMERZ,
      failed(two.payment.id),
    );
    expect(flipped.status).toBe(PaymentStatus.SUCCEEDED);
    expect(await stock()).toBe(beforeTwo);
    const twoRow = await prisma.order.findUniqueOrThrow({ where: { id: two.order.id } });
    expect(twoRow.status).toBe(OrderStatus.CONFIRMED);
    // one FAILED mail + one SUCCEEDED mail only
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
