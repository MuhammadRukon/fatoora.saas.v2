'use client';

import { useState } from 'react';
import { CodFeeStatus, OrderStatus, type Order, type Payment } from '@prisma/client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { describeCodFeeRule } from '@/lib/cod-fee/copy';
import { feeView } from '@/lib/cod-fee/view';
import { formatBDT } from '@/server/common/money';
import { AdminTxnIdDialog } from '@/modules/admin/payments/components/admin-txn-id-dialog';
import { FeeStatusBadge } from '@/modules/admin/payments/components/fee-status-badge';
import { RejectFeeDialog } from '@/modules/admin/payments/components/reject-fee-dialog';
import { useVerifyCodFee } from '@/modules/admin/payments/hooks';

interface CodFeePanelProps {
  order: Pick<Order, 'status' | 'totalCents' | 'orderNumber'>;
  payment: Payment;
}

/**
 * Admin order-detail panel for the COD confirmation fee: rule, amounts,
 * status, the customer's transaction id, and the verify / reject / edit-id
 * actions. While the order is PENDING the fee can be verified from PENDING or
 * REJECTED (a customer may pay after being rejected), but rejected only from
 * PENDING; the id can also be edited and the order waived or cancelled.
 */
export function CodFeePanel({ order, payment }: CodFeePanelProps) {
  const verifyFee = useVerifyCodFee();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const orderPending = order.status === OrderStatus.PENDING;
  const view = feeView(payment, order);
  const { canVerify, canReject, canEditTxn } = view.admin;

  const rule =
    payment.feeType && payment.feeValue !== null
      ? describeCodFeeRule({ type: payment.feeType, value: payment.feeValue }, payment.feeCents)
      : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>COD confirmation fee</CardTitle>
        <FeeStatusBadge status={payment.feeStatus} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Rule</dt>
            <dd>{rule ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Fee (advance)</dt>
            <dd className="font-medium">{formatBDT(payment.feeCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Due on delivery</dt>
            <dd className="font-medium">{formatBDT(view.dueCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Customer transaction ID</dt>
            <dd className="font-mono break-all">{payment.customerTxnId ?? '—'}</dd>
            {payment.txnSubmittedAt ? (
              <dd className="text-xs text-muted-foreground">
                Submitted {new Date(payment.txnSubmittedAt).toLocaleString()}
              </dd>
            ) : null}
          </div>
          {payment.feeVerifiedAt ? (
            <div>
              <dt className="text-xs text-muted-foreground">Verified</dt>
              <dd>{new Date(payment.feeVerifiedAt).toLocaleString()}</dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2 pt-1">
          <AdminTxnIdDialog payment={payment} canEdit={canEditTxn} />
          {canVerify ? (
            <Button
              type="button"
              size="sm"
              disabled={verifyFee.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Fee received — confirm order
            </Button>
          ) : null}
          <RejectFeeDialog paymentId={payment.id} canReject={canReject} verifyFee={verifyFee} />
        </div>
        {payment.feeStatus === CodFeeStatus.REJECTED && orderPending ? (
          <p className="text-xs text-muted-foreground">
            The fee was rejected. You can still correct the transaction ID, confirm that the fee
            was received, confirm the order without it (waives the fee), or cancel it.
          </p>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirm the fee was received?"
        description={`Order ${order.orderNumber} will be confirmed and the fee marked as verified.`}
        confirmLabel="Fee received — confirm order"
        onConfirm={() => verifyFee.mutate({ id: payment.id, outcome: 'VERIFIED' })}
      />
    </Card>
  );
}
