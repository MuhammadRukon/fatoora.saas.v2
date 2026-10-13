import { CodFeeStatus, OrderStatus, PaymentMethod } from '@prisma/client';
import type { Order, Payment } from '@prisma/client';

import { dueOnDeliveryCents } from './compute';
import { canFee } from './policy';

/** What the customer's order page should say about the COD confirmation fee. */
export type FeeNoticeState = 'none' | 'pending' | 'rejected' | 'verified';

export type FeeViewPayment = Pick<Payment, 'method' | 'feeStatus' | 'feeCents'>;
export type FeeViewOrder = Pick<Order, 'status' | 'totalCents'>;

export interface FeeView {
  status: CodFeeStatus;
  /** The payment carries a confirmation fee worth showing a panel for. */
  show: boolean;
  feeCents: number;
  /** Cash still owed on delivery (fee is credited only while PENDING/VERIFIED). */
  dueCents: number;
  customerNotice: FeeNoticeState;
  /**
   * Whether the "Confirmation fee (advance)" / "Due on delivery" summary rows
   * appear. Hidden for NONE and WAIVED (nothing was collected in advance).
   */
  showSummaryRows: boolean;
  admin: {
    canVerify: boolean;
    canReject: boolean;
    /** Editing the customer txn id is allowed in exactly the verify states. */
    canEditTxn: boolean;
    /** Confirming the order by hand would waive the fee server-side. */
    confirmWaivesFee: boolean;
  };
}

/**
 * Customer notice for the fee. Admin verify confirms the order, so VERIFIED
 * is shown for any non-cancelled status; the actionable states (pending,
 * rejected) only apply while the order is still PENDING. WAIVED, NONE,
 * non-COD and CANCELLED show nothing.
 */
export function feeNoticeState(
  orderStatus: OrderStatus,
  payment: Pick<Payment, 'method' | 'feeStatus'> | undefined,
): FeeNoticeState {
  if (!payment || payment.method !== PaymentMethod.COD || orderStatus === OrderStatus.CANCELLED) {
    return 'none';
  }
  if (payment.feeStatus === CodFeeStatus.VERIFIED) return 'verified';
  if (orderStatus !== OrderStatus.PENDING || !canFee('verify', payment.feeStatus)) return 'none';
  return payment.feeStatus === CodFeeStatus.REJECTED ? 'rejected' : 'pending';
}

/**
 * Single read-model for the COD confirmation fee, built on the policy table.
 * Pure and client-safe: order pages, the admin panel and the payments list
 * all derive their visibility and button state from here.
 */
export function feeView(payment: FeeViewPayment | undefined, order: FeeViewOrder): FeeView {
  const status = payment?.feeStatus ?? CodFeeStatus.NONE;
  const feeCents = payment?.feeCents ?? 0;
  const orderPending = order.status === OrderStatus.PENDING;
  const canVerify = orderPending && canFee('verify', status);

  return {
    status,
    show: status !== CodFeeStatus.NONE,
    feeCents,
    dueCents: dueOnDeliveryCents({ totalCents: order.totalCents, feeCents, feeStatus: status }),
    customerNotice: feeNoticeState(order.status, payment),
    showSummaryRows: feeCents > 0 && status !== CodFeeStatus.NONE && status !== CodFeeStatus.WAIVED,
    admin: {
      canVerify,
      canReject: orderPending && canFee('reject', status),
      canEditTxn: canVerify,
      confirmWaivesFee: orderPending && canFee('waive', status),
    },
  };
}
