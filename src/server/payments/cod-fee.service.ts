import { CodFeeStatus, OrderStatus, PaymentMethod, type Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@/server/common/errors';
import { FEE_ACTIONS, canFee, feeFrom, type FeeAction } from '@/lib/cod-fee/policy';
import { orderStatusEmail, sendMail } from '@/server/common/mailer';
import { claimOrderStatus, customerPaymentSelect } from '@/server/orders/orders.service';
import { normalizeTxnId } from '@/contracts/payments';

import { assertTxnIdFree, findPaymentByTxnId, mapTxnIdViolation } from './txn-id';

/**
 * COD confirmation-fee and transaction-id lifecycle: customer/admin txn id
 * submission, the duplicate check, and the admin fee decision (verify/reject).
 * Gateway lifecycle and manual verification live in `payments.service`.
 *
 * Lock order for every mutator that claims the order (admin txn id, fee
 * verify/reject): order row first, then payment row, matching
 * `ordersService.transition`, so concurrent callers can't deadlock.
 * `paymentsService.verify` / `applyCallback` follow the same order through
 * `confirmOrderInTx` (see `orders.service.ts`).
 */

type Tx = Prisma.TransactionClient;

/** Payment + its order (and the customer's email, for post-commit mail). */
async function loadPaymentWithOrder(tx: Tx, paymentId: string, ownerId?: string) {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { order: { include: { user: { select: { email: true } } } } },
  });
  // A wrong owner is reported as NotFound (no existence leak).
  if (!payment || (ownerId !== undefined && payment.order.userId !== ownerId)) {
    throw new NotFoundError('Payment');
  }
  return payment;
}

function assertOrderPending(order: { status: OrderStatus }) {
  if (order.status !== OrderStatus.PENDING) throw new ConflictError('Order is no longer pending');
}

/** Compare-and-set the order row (a no-op CAS when `status` is unchanged). */
async function claimOrder(tx: Tx, order: { id: string; status: OrderStatus }, status: OrderStatus) {
  const claimed = await claimOrderStatus(tx, order, { status });
  if (!claimed) throw new ConflictError('Order status changed, refresh and retry');
}

/**
 * Compare-and-set on the payment's fee status: applies `data` only while the
 * fee is still in a state `action` may start from, so exactly one concurrent
 * caller wins.
 */
async function casFee(
  tx: Tx,
  paymentId: string,
  action: FeeAction,
  data: Prisma.PaymentUncheckedUpdateManyInput,
  opts: { where?: Prisma.PaymentWhereInput; conflictMessage?: string } = {},
) {
  const res = await tx.payment.updateMany({
    where: { id: paymentId, feeStatus: { in: feeFrom(action) }, ...opts.where },
    data,
  });
  if (res.count !== 1) {
    throw new ConflictError(opts.conflictMessage ?? 'Confirmation fee already processed');
  }
}

function recordEvent(
  tx: Tx,
  orderId: string,
  event: { status: OrderStatus; note: string; actorId: string },
) {
  return tx.orderEvent.create({ data: { orderId, ...event } });
}

export const codFeeService = {
  /** Whether a transaction id is already used (customer txn id or bank ref, case-insensitive). */
  async txnIdExists(txnId: string): Promise<boolean> {
    return (await findPaymentByTxnId(prisma, txnId)) !== null;
  },

  /**
   * Customer attaches the transaction id of their manually-paid COD
   * confirmation fee. Add-only: once set it can't be changed by the customer.
   * Ownership failures are reported as NotFound (no existence leak), and a
   * duplicate id reveals nothing about the other order.
   */
  async submitCustomerTxnId(userId: string, paymentId: string, rawTxnId: string) {
    const txnId = normalizeTxnId(rawTxnId);
    try {
      return await prisma.$transaction(async (tx) => {
        const payment = await loadPaymentWithOrder(tx, paymentId, userId);
        if (payment.method !== PaymentMethod.COD || !canFee('reject', payment.feeStatus)) {
          // Customers may add the id only while the fee awaits its first decision.
          throw new ConflictError('No confirmation fee is awaiting a transaction ID');
        }
        assertOrderPending(payment.order);
        if (payment.customerTxnId) throw new ConflictError('Transaction ID already submitted');
        await assertTxnIdFree(tx, txnId);

        // Atomic add-only write: loses cleanly to a concurrent submit.
        await casFee(
          tx,
          paymentId,
          'reject',
          { customerTxnId: txnId, txnSubmittedAt: new Date() },
          { where: { customerTxnId: null }, conflictMessage: 'Transaction ID already submitted' },
        );

        await recordEvent(tx, payment.orderId, {
          status: payment.order.status,
          note: 'Customer submitted transaction ID',
          actorId: userId,
        });
        return tx.payment.findUniqueOrThrow({
          where: { id: paymentId },
          select: customerPaymentSelect,
        });
      });
    } catch (err) {
      // Lost a race on the unique index despite the pre-check.
      throw await mapTxnIdViolation(err, txnId);
    }
  },

  /**
   * Admin sets or replaces the transaction id on a fee-unverified COD
   * payment. A duplicate throws TXN_ID_DUPLICATE with the conflicting order's
   * id/number in `meta` (admin-only; `jsonError` serializes it).
   */
  async adminSetTxnId(adminId: string, paymentId: string, rawTxnId: string) {
    const txnId = normalizeTxnId(rawTxnId);
    const dupOpts = { excludePaymentId: paymentId, revealOrder: true };

    try {
      return await prisma.$transaction(async (tx) => {
        const payment = await loadPaymentWithOrder(tx, paymentId);
        if (payment.method !== PaymentMethod.COD || !canFee('verify', payment.feeStatus)) {
          throw new ConflictError('Transaction ID can only be set while the fee is unverified');
        }
        assertOrderPending(payment.order);

        // Claim the order row first (no-op CAS, same status) so a concurrent
        // cancel/confirm can't interleave with the payment write.
        await claimOrder(tx, payment.order, payment.order.status);

        await assertTxnIdFree(tx, txnId, dupOpts);

        await casFee(tx, paymentId, 'verify', {
          customerTxnId: txnId,
          txnSubmittedAt: new Date(),
        });

        await recordEvent(tx, payment.orderId, {
          status: payment.order.status,
          note: payment.customerTxnId
            ? `Admin replaced transaction ID (was ${payment.customerTxnId})`
            : 'Admin set transaction ID',
          actorId: adminId,
        });
        return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      });
    } catch (err) {
      throw await mapTxnIdViolation(err, txnId, dupOpts);
    }
  },

  /**
   * Admin decision on a COD confirmation fee (paid manually, outside the
   * system). VERIFIED confirms the order and is allowed from PENDING or from
   * REJECTED (a customer who paid after being rejected); REJECTED leaves the
   * order PENDING and is only allowed from PENDING.
   * Lock order matches `ordersService.transition` (order row, then payment
   * row) so the two can't deadlock: both outcomes claim the order row first
   * (REJECTED with a no-op CAS on the same status), then CAS the payment, so
   * exactly one concurrent caller wins. `adminSetTxnId` takes the same
   * order-then-payment path.
   */
  async verifyFee(
    adminId: string,
    paymentId: string,
    outcome: 'VERIFIED' | 'REJECTED',
    note?: string,
  ) {
    let notify: { email: string | null; orderNumber: string } | null = null;

    const updated = await prisma.$transaction(async (tx) => {
      const payment = await loadPaymentWithOrder(tx, paymentId);
      if (payment.method !== PaymentMethod.COD) {
        throw new BadRequestError('Confirmation fee only applies to COD payments');
      }
      // VERIFIED may follow an earlier rejection (the customer paid after all);
      // REJECTED is only a first decision (see FEE_ACTIONS).
      const action = outcome === 'VERIFIED' ? 'verify' : 'reject';
      if (!canFee(action, payment.feeStatus)) {
        throw new ConflictError('Confirmation fee already processed');
      }
      assertOrderPending(payment.order);

      // Claim the order row before touching the payment: VERIFIED moves it to
      // CONFIRMED, REJECTED is a no-op CAS (same status) that still serializes
      // against a concurrent cancel, so a CANCELLED order can't end up REJECTED.
      await claimOrder(
        tx,
        payment.order,
        outcome === 'VERIFIED' ? OrderStatus.CONFIRMED : payment.order.status,
      );

      await casFee(
        tx,
        paymentId,
        action,
        outcome === 'VERIFIED'
          ? {
              feeStatus: FEE_ACTIONS.verify.to,
              feeVerifiedById: adminId,
              feeVerifiedAt: new Date(),
            }
          : { feeStatus: FEE_ACTIONS.reject.to },
      );

      const base =
        outcome === 'VERIFIED'
          ? payment.feeStatus === CodFeeStatus.REJECTED
            ? 'COD confirmation fee verified by admin after an earlier rejection'
            : 'COD confirmation fee verified by admin'
          : 'COD confirmation fee rejected by admin';
      await recordEvent(tx, payment.orderId, {
        status: outcome === 'VERIFIED' ? OrderStatus.CONFIRMED : OrderStatus.PENDING,
        note: note ? `${base}: ${note}` : base,
        actorId: adminId,
      });

      if (outcome === 'VERIFIED') {
        notify = { email: payment.order.user.email, orderNumber: payment.order.orderNumber };
      }
      return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    });

    // Fire-and-forget, after commit: a failed email never fails the verify.
    if (notify) {
      const { email, orderNumber } = notify;
      void sendMail(email, orderStatusEmail({ orderNumber }, OrderStatus.CONFIRMED));
    }
    return updated;
  },
};
