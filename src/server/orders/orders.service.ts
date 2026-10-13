import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '@/server/common/errors';
import { orderStatusEmail, sendMail } from '@/server/common/mailer';
import { CUSTOMER_PAYMENT_FIELDS, type CustomerPaymentField } from '@/contracts/payments';
import { FEE_ACTIONS, feeFrom } from '@/lib/cod-fee/policy';

/** Payment columns safe to return to the customer (see CUSTOMER_PAYMENT_FIELDS). */
export const customerPaymentSelect = Object.fromEntries(
  CUSTOMER_PAYMENT_FIELDS.map((field) => [field, true]),
) as Record<CustomerPaymentField, true>;

const baseOrderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' as const } },
  address: true,
} satisfies Prisma.OrderInclude;

/** Customer-facing detail: payments are trimmed to `customerPaymentSelect`. */
const orderInclude = {
  ...baseOrderInclude,
  payments: { select: customerPaymentSelect },
} satisfies Prisma.OrderInclude;

/** Admin detail: the full payment row. */
const adminOrderInclude = {
  ...baseOrderInclude,
  payments: true,
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Restore stock for an order's line items. Shared by admin cancel,
 * payment-failure callbacks, and orphaned-checkout cleanup — every
 * place that undoes a `placeOrder` stock decrement.
 */
export async function restockOrderItems(
  tx: Prisma.TransactionClient,
  items: { variantId: string | null; quantity: number }[],
) {
  for (const item of items) {
    if (item.variantId) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }
}

/**
 * Compare-and-set on order status: applies `data` only if the order is
 * still in the status we read. Returns false when a concurrent writer
 * got there first, so exactly one caller wins.
 */
export async function claimOrderStatus(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus },
  data: Prisma.OrderUpdateManyMutationInput,
): Promise<boolean> {
  const res = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data,
  });
  return res.count === 1;
}

/**
 * Cancel an order inside an existing transaction: claim the status, then
 * (only if claimed) restock its items and append the CANCELLED event.
 * Returns false when a concurrent writer already changed the status.
 */
export async function cancelOrderInTx(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus; items: { variantId: string | null; quantity: number }[] },
  opts: { reason: string; event: { note: string; actorId?: string } },
): Promise<boolean> {
  const claimed = await claimOrderStatus(tx, order, {
    status: OrderStatus.CANCELLED,
    cancelledAt: new Date(),
    cancelReason: opts.reason,
  });
  if (!claimed) return false;

  await restockOrderItems(tx, order.items);

  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      status: OrderStatus.CANCELLED,
      note: opts.event.note,
      actorId: opts.event.actorId,
    },
  });
  return true;
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

/**
 * Confirm an order inside an existing transaction: compare-and-set the status
 * from `from` to CONFIRMED, then (only if claimed) append the CONFIRMED event.
 * Returns false, writing nothing, when `from` cannot move to CONFIRMED or a
 * concurrent writer (cancel, another confirm) changed the status first, so a
 * confirm can never overwrite a CANCELLED order.
 *
 * Lock order: this claims the order row, so call it before touching the
 * payment row, like `ordersService.transition` and `codFeeService.verifyFee`.
 */
export async function confirmOrderInTx(
  tx: Prisma.TransactionClient,
  order: { id: string },
  opts: { from: OrderStatus; note: string; actorId?: string },
): Promise<boolean> {
  if (!ALLOWED_TRANSITIONS[opts.from].includes(OrderStatus.CONFIRMED)) return false;

  const claimed = await claimOrderStatus(
    tx,
    { id: order.id, status: opts.from },
    { status: OrderStatus.CONFIRMED },
  );
  if (!claimed) return false;

  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      status: OrderStatus.CONFIRMED,
      note: opts.note,
      actorId: opts.actorId,
    },
  });
  return true;
}

export const ordersService = {
  listByUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      include: { items: true, payments: { select: customerPaymentSelect } },
      orderBy: { createdAt: 'desc' },
    });
  },

  listAll() {
    return prisma.order.findMany({
      include: {
        items: true,
        payments: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getOwned(userId: string, id: string) {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundError('Order');
    if (order.userId !== userId) throw new ForbiddenError('Not your order');
    return order;
  },

  async getAdmin(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { ...adminOrderInclude, user: true },
    });
    if (!order) throw new NotFoundError('Order');
    return order;
  },

  /**
   * Customer-initiated cancellation. Allowed only while the order is
   * still in PENDING / CONFIRMED / PROCESSING. Once it has shipped the
   * customer must contact support; once delivered the path is the
   * warranty flow. Stock is restocked atomically on cancellation.
   */
  async cancelByCustomer(userId: string, orderId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
      if (!order) throw new NotFoundError('Order');
      if (order.userId !== userId) throw new ForbiddenError('Not your order');
      if (order.status === OrderStatus.SHIPPED || order.status === OrderStatus.DELIVERED) {
        throw new ConflictError('Order has already shipped');
      }
      if (order.status === OrderStatus.CANCELLED) {
        throw new ConflictError('Order is already cancelled');
      }

      const cancelled = await cancelOrderInTx(tx, order, {
        reason,
        event: { note: `Cancelled by customer: ${reason}`, actorId: userId },
      });
      if (!cancelled) {
        throw new ConflictError('Order status changed, refresh and retry');
      }

      return tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    });
  },

  /**
   * Admin transition with optional note. Rejects any move not in
   * ALLOWED_TRANSITIONS (e.g. DELIVERED -> PENDING, re-cancelling an
   * already-cancelled order). Cancelling restocks the order's items,
   * matching customer self-cancel behavior.
   *
   * Confirming a PENDING order whose COD confirmation fee is unverified
   * (PENDING/REJECTED) is allowed but waives the fee (feeStatus -> WAIVED)
   * in the same transaction, and the event note records that.
   */
  async transition(adminId: string, orderId: string, status: OrderStatus, note?: string) {
    const { updated, customerEmail } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, user: { select: { email: true } } },
      });
      if (!order) throw new NotFoundError('Order');
      if (!ALLOWED_TRANSITIONS[order.status].includes(status)) {
        throw new ConflictError(`Cannot move order from ${order.status} to ${status}`);
      }

      const claimed = await claimOrderStatus(tx, order, {
        status,
        cancelledAt: status === OrderStatus.CANCELLED ? new Date() : order.cancelledAt,
        cancelReason: status === OrderStatus.CANCELLED ? (note ?? 'Admin') : order.cancelReason,
      });
      if (!claimed) {
        throw new ConflictError('Order status changed, refresh and retry');
      }
      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

      if (status === OrderStatus.CANCELLED) {
        await restockOrderItems(tx, order.items);
      }

      // Lock order is order row (claimed above) then payment row, matching
      // codFeeService.verifyFee.
      let eventNote = note ?? null;
      if (order.status === OrderStatus.PENDING && status === OrderStatus.CONFIRMED) {
        const waived = await tx.payment.updateMany({
          where: {
            orderId,
            method: PaymentMethod.COD,
            feeStatus: { in: feeFrom('waive') },
          },
          data: { feeStatus: FEE_ACTIONS.waive.to },
        });
        if (waived.count > 0) {
          const waiver = 'Confirmed without confirmation fee (waived by admin)';
          eventNote = note ? `${waiver}: ${note}` : waiver;
        }
      }

      await tx.orderEvent.create({
        data: { orderId, status, note: eventNote, actorId: adminId },
      });
      return { updated, customerEmail: order.user.email };
    });

    // Fire-and-forget, after commit: a failed email never fails the transition.
    void sendMail(customerEmail, orderStatusEmail({ orderNumber: updated.orderNumber }, status));

    return updated;
  },
};
