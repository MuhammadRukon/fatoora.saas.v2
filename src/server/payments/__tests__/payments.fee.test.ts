/**
 * Live-DB tests for the COD confirmation fee flows in codFeeService / paymentsService
 * (customer txn id, admin txn id, fee verify/reject, cash-verify guard).
 * Orders/payments are hand-built via `createManualOrder`, so these never
 * depend on (or touch) the PaymentSettings singleton.
 */
import { CodFeeStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TxnIdDuplicateError,
} from '@/server/common/errors';
import {
  cleanupCheckoutFixtures,
  createAdminUser,
  createManualOrder,
  eventsFor,
} from '@/server/checkout/__tests__/fixtures';

import { cancelOrderInTx, ordersService } from '@/server/orders/orders.service';

import { codFeeService } from '../cod-fee.service';
import { paymentsService } from '../payments.service';

afterEach(async () => {
  await cleanupCheckoutFixtures();
});

function feePending(overrides: Parameters<typeof createManualOrder>[0] = {}) {
  return createManualOrder({
    method: PaymentMethod.COD,
    feeStatus: CodFeeStatus.PENDING,
    feeCents: 10_000,
    ...overrides,
  });
}

describe('codFeeService.submitCustomerTxnId', () => {
  it('sets the normalized id once, stamps txnSubmittedAt and writes an OrderEvent', async () => {
    const { userId, order, payment } = await feePending();

    const updated = await codFeeService.submitCustomerTxnId(userId, payment.id, ' abc12345 ');

    expect(updated.customerTxnId).toBe('ABC12345');
    expect(updated.txnSubmittedAt).not.toBeNull();
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].note).toBe('Customer submitted transaction ID');
    expect(events[0].actorId).toBe(userId);
    expect(events[0].status).toBe(OrderStatus.PENDING);
  });

  it('a second call with a different id is a ConflictError and the value is unchanged', async () => {
    const { userId, payment } = await feePending();
    await codFeeService.submitCustomerTxnId(userId, payment.id, 'FIRST12345');

    await expect(
      codFeeService.submitCustomerTxnId(userId, payment.id, 'SECOND12345'),
    ).rejects.toBeInstanceOf(ConflictError);

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.customerTxnId).toBe('FIRST12345');
  });

  it("another user's payment is NotFoundError", async () => {
    const { payment } = await feePending();
    const stranger = await createManualOrder();

    await expect(
      codFeeService.submitCustomerTxnId(stranger.userId, payment.id, 'ABC12345'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('feeStatus NONE, a non-PENDING order, or a non-COD payment is a ConflictError', async () => {
    const none = await createManualOrder({ method: PaymentMethod.COD });
    const cancelled = await feePending({ orderStatus: OrderStatus.CANCELLED });
    const bank = await createManualOrder({ method: PaymentMethod.BANK_TRANSFER });

    for (const f of [none, cancelled, bank]) {
      await expect(
        codFeeService.submitCustomerTxnId(f.userId, f.payment.id, 'ABC12345'),
      ).rejects.toBeInstanceOf(ConflictError);
      const row = await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } });
      expect(row.customerTxnId).toBeNull();
    }
  });

  it('a duplicate on another payment throws TXN_ID_DUPLICATE without leaking order info', async () => {
    const taken = await feePending({ customerTxnId: 'TAKEN12345' });
    const mine = await feePending();

    const err = await codFeeService
      .submitCustomerTxnId(mine.userId, mine.payment.id, 'taken12345')
      .catch((e) => e);

    expect(err).toBeInstanceOf(TxnIdDuplicateError);
    expect(err.code).toBe('TXN_ID_DUPLICATE');
    expect(err.meta).toBeUndefined();
    expect(err.message).not.toContain(taken.order.orderNumber);
    expect(err.message).not.toContain(taken.order.id);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: mine.payment.id } });
    expect(row.customerTxnId).toBeNull();
  });

  it('also collides with an existing bank reference (case-insensitive)', async () => {
    await createManualOrder({ method: PaymentMethod.BANK_TRANSFER, bankRef: 'bankref9999' });
    const mine = await feePending();

    await expect(
      codFeeService.submitCustomerTxnId(mine.userId, mine.payment.id, 'BANKREF9999'),
    ).rejects.toBeInstanceOf(TxnIdDuplicateError);
  });

  it('two concurrent calls with the same id on different payments: exactly one wins', async () => {
    const a = await feePending();
    const b = await feePending();

    const results = await Promise.allSettled([
      codFeeService.submitCustomerTxnId(a.userId, a.payment.id, 'RACE123456'),
      codFeeService.submitCustomerTxnId(b.userId, b.payment.id, 'RACE123456'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(TxnIdDuplicateError);
    expect(await prisma.payment.count({ where: { customerTxnId: 'RACE123456' } })).toBe(1);
  });
});

describe('codFeeService.adminSetTxnId', () => {
  it('sets, then replaces, the id and writes an event each time', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const first = await codFeeService.adminSetTxnId(admin.id, payment.id, 'adm1111111');
    expect(first.customerTxnId).toBe('ADM1111111');

    const second = await codFeeService.adminSetTxnId(admin.id, payment.id, 'ADM2222222');
    expect(second.customerTxnId).toBe('ADM2222222');

    const events = await eventsFor(order.id);
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.actorId === admin.id)).toBe(true);
    expect(events[1].note).toContain('replaced');
  });

  it('is allowed while the fee is REJECTED, and idempotent for the same id', async () => {
    const admin = await createAdminUser();
    const { payment } = await feePending({ feeStatus: CodFeeStatus.REJECTED });

    await codFeeService.adminSetTxnId(admin.id, payment.id, 'REJ1234567');
    const again = await codFeeService.adminSetTxnId(admin.id, payment.id, 'rej1234567');
    expect(again.customerTxnId).toBe('REJ1234567');
  });

  it('a duplicate throws a TxnIdDuplicateError carrying the existing order id and number', async () => {
    const admin = await createAdminUser();
    const taken = await feePending({ customerTxnId: 'TAKEN99999' });
    const mine = await feePending({ customerTxnId: 'MINE123456' });

    const err = await codFeeService
      .adminSetTxnId(admin.id, mine.payment.id, 'taken99999')
      .catch((e) => e);

    expect(err).toBeInstanceOf(TxnIdDuplicateError);
    expect(err.code).toBe('TXN_ID_DUPLICATE');
    expect(err.meta).toEqual({
      existingOrderId: taken.order.id,
      existingOrderNumber: taken.order.orderNumber,
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: mine.payment.id } });
    expect(row.customerTxnId).toBe('MINE123456');
  });

  it('rejects when the fee is not unverified, the order is not PENDING, or the payment is unknown', async () => {
    const admin = await createAdminUser();
    const verified = await feePending({ feeStatus: CodFeeStatus.VERIFIED });
    const none = await createManualOrder();
    const cancelled = await feePending({ orderStatus: OrderStatus.CANCELLED });

    for (const f of [verified, none, cancelled]) {
      await expect(
        codFeeService.adminSetTxnId(admin.id, f.payment.id, 'ABC12345'),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    await expect(
      codFeeService.adminSetTxnId(admin.id, 'does-not-exist', 'ABC12345'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('codFeeService.verifyFee', () => {
  it('VERIFIED: fee VERIFIED, admin recorded, order CONFIRMED, CONFIRMED event by the admin', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const updated = await codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED');

    expect(updated.feeStatus).toBe(CodFeeStatus.VERIFIED);
    expect(updated.feeVerifiedById).toBe(admin.id);
    expect(updated.feeVerifiedAt).not.toBeNull();
    // Cash is still due on delivery: the payment itself stays PENDING.
    expect(updated.status).toBe(PaymentStatus.PENDING);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].note).toContain('fee verified');
  });

  it('a second VERIFIED call is a ConflictError and adds no event', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();
    await codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED');

    await expect(codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(await eventsFor(order.id)).toHaveLength(1);
  });

  it('on a CANCELLED order it is a ConflictError and the order stays CANCELLED', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending({ orderStatus: OrderStatus.CANCELLED });

    await expect(codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED')).rejects.toBeInstanceOf(
      ConflictError,
    );

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CANCELLED);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.feeStatus).toBe(CodFeeStatus.PENDING);
  });

  it('two concurrent VERIFIED calls: exactly one fulfils, one event', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const results = await Promise.allSettled([
      codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED'),
      codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    expect(await eventsFor(order.id)).toHaveLength(1);
  });

  it('REJECTED: fee REJECTED, order stays PENDING, event note mentions "rejected"', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const updated = await codFeeService.verifyFee(admin.id, payment.id, 'REJECTED', 'no txn');

    expect(updated.feeStatus).toBe(CodFeeStatus.REJECTED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.PENDING);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.PENDING);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].note).toContain('rejected');
    expect(events[0].note).toContain('no txn');
  });

  it('VERIFIED is allowed from PENDING or REJECTED only; REJECTED only from PENDING', async () => {
    const admin = await createAdminUser();
    const none = await createManualOrder();
    const bank = await createManualOrder({ method: PaymentMethod.BANK_TRANSFER });

    // VERIFIED from WAIVED / NONE / VERIFIED is a conflict.
    for (const feeStatus of [CodFeeStatus.WAIVED, CodFeeStatus.VERIFIED]) {
      const f = await feePending({ feeStatus });
      await expect(
        codFeeService.verifyFee(admin.id, f.payment.id, 'VERIFIED'),
      ).rejects.toBeInstanceOf(ConflictError);
    }
    await expect(
      codFeeService.verifyFee(admin.id, none.payment.id, 'VERIFIED'),
    ).rejects.toBeInstanceOf(ConflictError);

    // REJECTED from anything but PENDING is a conflict (incl. REJECTED -> REJECTED).
    for (const feeStatus of [CodFeeStatus.REJECTED, CodFeeStatus.WAIVED, CodFeeStatus.VERIFIED]) {
      const f = await feePending({ feeStatus });
      await expect(
        codFeeService.verifyFee(admin.id, f.payment.id, 'REJECTED'),
      ).rejects.toBeInstanceOf(ConflictError);
      const row = await prisma.payment.findUniqueOrThrow({ where: { id: f.payment.id } });
      expect(row.feeStatus).toBe(feeStatus);
    }
    await expect(
      codFeeService.verifyFee(admin.id, none.payment.id, 'REJECTED'),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      codFeeService.verifyFee(admin.id, bank.payment.id, 'VERIFIED'),
    ).rejects.toBeInstanceOf(BadRequestError);
    await expect(
      codFeeService.verifyFee(admin.id, 'does-not-exist', 'VERIFIED'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('codFeeService.verifyFee after a rejection', () => {
  it('VERIFIED from REJECTED confirms the order, records the admin and notes the earlier rejection', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending({ feeStatus: CodFeeStatus.REJECTED });

    const updated = await codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED');

    expect(updated.feeStatus).toBe(CodFeeStatus.VERIFIED);
    expect(updated.feeVerifiedById).toBe(admin.id);
    expect(updated.feeVerifiedAt).not.toBeNull();
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe(OrderStatus.CONFIRMED);
    expect(events[0].actorId).toBe(admin.id);
    expect(events[0].note).toContain('fee verified');
    expect(events[0].note).toContain('earlier rejection');
  });

  it('a plain PENDING -> VERIFIED note does not mention a rejection', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    await codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED');

    const [event] = await eventsFor(order.id);
    expect(event.note).toContain('fee verified');
    expect(event.note).not.toContain('rejection');
  });

  it('two concurrent VERIFIED calls on a REJECTED fee: exactly one wins, one event', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending({ feeStatus: CodFeeStatus.REJECTED });

    const results = await Promise.allSettled([
      codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED'),
      codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED'),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);
    expect(await eventsFor(order.id)).toHaveLength(1);
  });

  it('cash verify() is still blocked for a PENDING or REJECTED fee until the fee is decided', async () => {
    const admin = await createAdminUser();
    for (const feeStatus of [CodFeeStatus.PENDING, CodFeeStatus.REJECTED]) {
      const { payment } = await feePending({ feeStatus });
      await expect(
        paymentsService.verify(admin.id, payment.id, 'SUCCEEDED'),
      ).rejects.toBeInstanceOf(ConflictError);
    }
  });
});

describe('verifyFee racing an admin PENDING -> CONFIRMED', () => {
  it('no deadlock: exactly one wins and the fee status matches the winner', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const results = await Promise.allSettled([
      codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED'),
      ordersService.transition(admin.id, order.id, OrderStatus.CONFIRMED),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected[0].reason).toBeInstanceOf(ConflictError);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.feeStatus).toBe(
      results[0].status === 'fulfilled' ? CodFeeStatus.VERIFIED : CodFeeStatus.WAIVED,
    );
    expect(await eventsFor(order.id)).toHaveLength(1);
  });
});

describe('paymentsService.verify (cash) guard', () => {
  it('COD with an unverified fee is a ConflictError ("Verify the confirmation fee first")', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const err = await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED').catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe('Verify the confirmation fee first');
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.status).toBe(PaymentStatus.PENDING);
    expect(await eventsFor(order.id)).toHaveLength(0);
  });

  it('COD with a REJECTED fee is a ConflictError telling the admin to waive or decide the fee', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending({ feeStatus: CodFeeStatus.REJECTED });

    const err = await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED').catch((e) => e);

    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toMatch(/rejected/i);
    expect(err.message).toMatch(/waive/i);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(row.status).toBe(PaymentStatus.PENDING);
    expect(await eventsFor(order.id)).toHaveLength(0);
  });

  it('COD with feeStatus NONE behaves as before', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await createManualOrder({ method: PaymentMethod.COD });

    const updated = await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED');

    expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CONFIRMED);
  });

  it('COD succeeds once the fee has been verified', async () => {
    const admin = await createAdminUser();
    const { payment } = await feePending();
    await codFeeService.verifyFee(admin.id, payment.id, 'VERIFIED');

    const updated = await paymentsService.verify(admin.id, payment.id, 'SUCCEEDED');
    expect(updated.status).toBe(PaymentStatus.SUCCEEDED);
  });
});

describe('fee writes racing an order cancel', () => {
  /**
   * Holds an open transaction that has cancelled the order (row locked, not
   * yet committed), starts `action`, then commits. Without a claim on the
   * order row the action would write to the payment and leave a CANCELLED
   * order with a changed fee.
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

  it('verifyFee REJECTED loses to a concurrent cancel (ConflictError, fee stays PENDING)', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const res = await actionRacingCancel(order.id, () =>
      codFeeService.verifyFee(admin.id, payment.id, 'REJECTED'),
    );

    expect(res.error).toBeInstanceOf(ConflictError);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.feeStatus).toBe(CodFeeStatus.PENDING);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(OrderStatus.CANCELLED);
  });

  it('adminSetTxnId loses to a concurrent cancel (ConflictError, txn id not written)', async () => {
    const admin = await createAdminUser();
    const { order, payment } = await feePending();

    const res = await actionRacingCancel(order.id, () =>
      codFeeService.adminSetTxnId(admin.id, payment.id, 'RACECANCEL1'),
    );

    expect(res.error).toBeInstanceOf(ConflictError);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(pay.customerTxnId).toBeNull();
  });
});
