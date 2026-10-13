import { CodFeeStatus, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/server/common/errors';
import { canFee } from '@/lib/cod-fee/policy';
import { log } from '@/server/common/logger';
import { paymentResultEmail, sendMail } from '@/server/common/mailer';
import {
  confirmOrderInTx,
  customerPaymentSelect,
  restockOrderItems,
} from '@/server/orders/orders.service';
import type { InitiatedPayment } from '@/contracts/payments';

import type { CallbackOutcome, PaymentInitInput } from './gateway.interface';
import { getGateway } from './registry';

/**
 * `payments.service` owns the payment-gateway lifecycle and manual
 * verification:
 *   - it is the only module that calls a `PaymentGateway` strategy
 *     (`kickoff`, `applyCallback`)
 *   - manual verification (`submitBankReference`, `verify`,
 *     `listPendingForVerification`)
 *   - it confirms an `Order` (PENDING -> CONFIRMED) on payment, always via the
 *     `confirmOrderInTx` compare-and-set so a confirm cannot overwrite a
 *     concurrent cancel
 *
 * The COD confirmation-fee and transaction-id lifecycle lives in
 * `cod-fee.service.ts`. Other modules also write payment state:
 * `checkout.service` creates the `Payment` row with its orders, and
 * `orders.service` waives the fee when an admin confirms the order.
 *
 * Lock order for every path that confirms an order: order row first (the
 * `confirmOrderInTx` claim), then the payment row, matching
 * `ordersService.transition` and `codFeeService.verifyFee`.
 *
 * Gateway callbacks and verification are idempotent. Callbacks can fire twice (and they do, in
 * practice) so we no-op when the payment is already terminal and we
 * use `providerRef` as the natural dedupe key.
 */

interface KickoffArgs {
  /** Absolute origin used to build success / fail / IPN URLs. */
  origin: string;
}

/** Thrown inside the callback transaction to roll it back when the payment CAS loses. */
class CallbackRaceLost extends Error {}

function nullOnRaceLost(err: unknown): null {
  if (err instanceof CallbackRaceLost) return null;
  throw err;
}

function buildUrls(origin: string, method: PaymentMethod, paymentId: string, orderId: string) {
  const base = `${origin.replace(/\/$/, '')}`;
  const provider = method.toLowerCase();
  return {
    successUrl: `${base}/api/payments/${provider}/success?paymentId=${paymentId}`,
    failUrl: `${base}/api/payments/${provider}/fail?paymentId=${paymentId}`,
    cancelUrl: `${base}/api/payments/${provider}/cancel?paymentId=${paymentId}`,
    ipnUrl: `${base}/api/payments/${provider}/ipn`,
    orderUrl: `${base}/orders/${orderId}`,
  };
}

export const paymentsService = {
  /**
   * Hand off the user to the gateway. Called immediately after
   * `checkoutService.placeOrder` for any non-COD method.
   */
  async kickoff(paymentId: string, args: KickoffArgs): Promise<InitiatedPayment> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: { include: { user: true } } },
    });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictError('Payment is no longer pending');
    }

    if (payment.method === PaymentMethod.COD) {
      // COD never has a gateway hop. checkoutService already auto-confirmed
      // the order, or left it PENDING awaiting its confirmation fee
      // (codFeeService.verifyFee); nothing to redirect to either way.
      return { paymentId: payment.id, redirectUrl: null };
    }

    const urls = buildUrls(args.origin, payment.method, payment.id, payment.orderId);
    const gateway = getGateway(payment.method);

    const initInput: PaymentInitInput = {
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      paymentId: payment.id,
      amountCents: payment.amountCents,
      customer: {
        name: payment.order.shipRecipient,
        email: payment.order.user.email ?? '',
        phone: payment.order.shipPhone,
      },
      successUrl: urls.successUrl,
      failUrl: urls.failUrl,
      cancelUrl: urls.cancelUrl,
      ipnUrl: urls.ipnUrl,
    };

    const result = await gateway.init(initInput);

    if (result.providerRef) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: result.providerRef,
          rawPayload: (result.rawPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
    }

    return { paymentId: payment.id, redirectUrl: result.redirectUrl || urls.orderUrl };
  },

  /**
   * Apply a normalised gateway callback to the database. Idempotent:
   * once a payment is terminal it's never overwritten, and the order
   * status only advances on the first SUCCEEDED.
   *
   * A SUCCEEDED callback claims the order row (PENDING -> CONFIRMED) before
   * the payment write. If the order is no longer PENDING (cancelled, or
   * confirmed by someone else) the claim is skipped: the payment is still
   * recorded, the order is left alone (no status change, no email),
   * `payments.callback.order_not_pending` is logged and an audit OrderEvent
   * ("Payment received ... review or refund") is written. The callback never
   * errors on that, so the gateway does not retry in a loop.
   *
   * The payment write is a compare-and-set from PENDING. If a concurrent
   * callback won, the whole transaction (order claim, restock, events) rolls
   * back and the current payment is returned, like the terminal no-op above.
   */
  async applyCallback(method: PaymentMethod, outcome: CallbackOutcome) {
    // The customer notification is collected inside the transaction but
    // sent only after it commits (never email about a rolled-back state).
    let notify: {
      email: string | null;
      orderNumber: string;
      totalCents: number;
      succeeded: boolean;
    } | null = null;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: outcome.paymentId },
      });
      if (!payment) throw new NotFoundError('Payment');
      if (payment.method !== method) {
        throw new BadRequestError('Method mismatch on payment callback');
      }

      // No-op once terminal.
      if (
        payment.status === PaymentStatus.SUCCEEDED ||
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.CANCELLED ||
        payment.status === PaymentStatus.REFUNDED
      ) {
        return payment;
      }

      // A SUCCEEDED callback whose independently-verified amount doesn't
      // match what we charged is treated as FAILED (which restocks below):
      // otherwise a tampered gateway hop could pay less than the order
      // total and still confirm it. `verifiedAmountCents` is only set on
      // live validation paths — sandbox callbacks carry no independent
      // amount and are unaffected.
      let effectiveStatus = outcome.status;
      let amountMismatch = false;
      if (
        outcome.status === PaymentStatus.SUCCEEDED &&
        outcome.verifiedAmountCents !== undefined &&
        outcome.verifiedAmountCents !== payment.amountCents
      ) {
        amountMismatch = true;
        effectiveStatus = PaymentStatus.FAILED;
        log.error('payments.callback.amount_mismatch', {
          paymentId: payment.id,
          expectedCents: payment.amountCents,
          gotCents: outcome.verifiedAmountCents,
        });
      }

      // Claim the order row before writing the payment (lock order).
      if (effectiveStatus === PaymentStatus.SUCCEEDED) {
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          select: {
            id: true,
            status: true,
            orderNumber: true,
            totalCents: true,
            user: { select: { email: true } },
          },
        });
        if (!order) throw new NotFoundError('Order');
        const confirmed = await confirmOrderInTx(tx, order, {
          from: order.status,
          note: `Payment received via ${method}`,
        });
        if (confirmed) {
          notify = {
            email: order.user.email,
            orderNumber: order.orderNumber,
            totalCents: order.totalCents,
            succeeded: true,
          };
        } else {
          // Money arrived for an order that can no longer be confirmed. Leave
          // the order alone but put an audit note on its timeline (no actor,
          // no email) so an admin can review or refund. Re-read the status:
          // the claim may have lost to a concurrent writer after our first read.
          const now = await tx.order.findUnique({
            where: { id: order.id },
            select: { status: true },
          });
          const currentStatus = now?.status ?? order.status;
          log.warn('payments.callback.order_not_pending', {
            paymentId: payment.id,
            orderId: order.id,
            orderStatusRead: order.status,
            orderStatusNow: currentStatus,
            method,
          });
          await tx.orderEvent.create({
            data: {
              orderId: order.id,
              status: currentStatus,
              note: `Payment received via ${method} after the order was ${currentStatus.toLowerCase()}; review or refund`,
            },
          });
        }
      }

      // Compare-and-set: only the call that moves the payment out of PENDING
      // wins. A concurrent callback that got there first makes this a no-op
      // that rolls the whole transaction back (order claim, audit event).
      const claimedPayment = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: effectiveStatus,
          providerRef: outcome.providerRef,
          rawPayload: (outcome.rawPayload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
      if (claimedPayment.count !== 1) throw new CallbackRaceLost();
      const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

      if (
        effectiveStatus === PaymentStatus.FAILED ||
        effectiveStatus === PaymentStatus.CANCELLED
      ) {
        // Don't auto-cancel the order yet; the customer might retry.
        // Restock so the held inventory isn't lost while they decide.
        const order = await tx.order.findUnique({
          where: { id: payment.orderId },
          include: { items: true, user: { select: { email: true } } },
        });
        if (order) {
          await restockOrderItems(tx, order.items);
          notify = {
            email: order.user.email,
            orderNumber: order.orderNumber,
            totalCents: order.totalCents,
            succeeded: false,
          };
        }
        await tx.orderEvent.create({
          data: {
            orderId: payment.orderId,
            status: OrderStatus.PENDING,
            note: amountMismatch
              ? `Payment rejected via ${method}: amount mismatch; stock restored`
              : `Payment ${effectiveStatus.toLowerCase()} via ${method}; stock restored`,
          },
        });
      }

      log.info('payments.callback.applied', {
        paymentId: updated.id,
        status: updated.status,
        method,
      });
      return updated;
    }).catch(nullOnRaceLost);

    if (result === null) {
      // A concurrent callback moved the payment out of PENDING first. This
      // call's transaction rolled back (no restock, no order claim, no event),
      // so send nothing and answer with the payment as it now stands.
      log.info('payments.callback.lost_race', { paymentId: outcome.paymentId, method });
      return prisma.payment.findUniqueOrThrow({ where: { id: outcome.paymentId } });
    }

    if (notify) {
      const { email, orderNumber, totalCents, succeeded } = notify;
      void sendMail(email, paymentResultEmail({ orderNumber, totalCents }, succeeded));
    }
    return result;
  },

  /**
   * Customer attaches a manual bank-transfer reference to their
   * pending payment. Status stays PENDING until an admin verifies.
   */
  async submitBankReference(userId: string, paymentId: string, bankRef: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundError('Payment');
    if (payment.order.userId !== userId) throw new ForbiddenError('Not your order');
    if (payment.method !== PaymentMethod.BANK_TRANSFER) {
      throw new BadRequestError('Reference can only be attached to bank transfers');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new ConflictError('Payment already processed');
    }
    return prisma.payment.update({
      where: { id: paymentId },
      data: { bankRef },
      select: customerPaymentSelect,
    });
  },

  /**
   * Admin verification path. Used for COD on delivery and for
   * manual bank-transfer payments. Outcome SUCCEEDED transitions the
   * order to CONFIRMED (if it isn't already) and emits an audit event.
   *
   * Confirming claims the order row first (`confirmOrderInTx`), then the
   * payment row is compare-and-set from PENDING, so a concurrent cancel or a
   * second verify makes exactly one caller win; the loser gets a
   * ConflictError and the whole transaction (including the claim) rolls back.
   */
  async verify(adminId: string, paymentId: string, outcome: 'SUCCEEDED' | 'FAILED', note?: string) {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { order: true },
      });
      if (!payment) throw new NotFoundError('Payment');
      if (payment.status !== PaymentStatus.PENDING) {
        throw new ConflictError('Payment already processed');
      }
      // A COD order whose confirmation fee is still unverified must go through
      // codFeeService.verifyFee first (or be confirmed/waived via ordersService.transition).
      // A rejected fee is a decision already made: the admin either waives it
      // by confirming the order or reopens it by verifying the fee.
      if (payment.method === PaymentMethod.COD && canFee('verify', payment.feeStatus)) {
        throw new ConflictError(
          payment.feeStatus === CodFeeStatus.REJECTED
            ? 'The confirmation fee was rejected. Verify the fee, or waive it by changing the order status to Confirmed.'
            : 'Verify the confirmation fee first',
        );
      }

      const noteText =
        note ??
        `Payment ${outcome === 'SUCCEEDED' ? 'verified' : 'rejected'} by admin (${payment.method})`;

      // Claim the order row before the payment row (lock order). The claim
      // writes the CONFIRMED event itself.
      const confirming = outcome === 'SUCCEEDED' && payment.order.status === OrderStatus.PENDING;
      if (confirming) {
        const confirmed = await confirmOrderInTx(tx, payment.order, {
          from: payment.order.status,
          note: noteText,
          actorId: adminId,
        });
        if (!confirmed) throw new ConflictError('Order is no longer pending');
      }

      const claimedPayment = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: {
          status: outcome === 'SUCCEEDED' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
          verifiedById: adminId,
          verifiedAt: new Date(),
        },
      });
      if (claimedPayment.count !== 1) throw new ConflictError('Payment already processed');

      if (!confirming) {
        await tx.orderEvent.create({
          data: {
            orderId: payment.orderId,
            status: outcome === 'SUCCEEDED' ? OrderStatus.CONFIRMED : payment.order.status,
            note: noteText,
            actorId: adminId,
          },
        });
      }

      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });
  },

  /**
   * Admin listing for the payment-verification screen. Returns
   * payments awaiting human action, newest first.
   */
  listPendingForVerification() {
    return prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        method: { in: [PaymentMethod.COD, PaymentMethod.BANK_TRANSFER] },
        // A cancelled order has nothing left to verify.
        order: { status: { not: OrderStatus.CANCELLED } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalCents: true,
            shipRecipient: true,
            shipPhone: true,
            shipCity: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  },
};
