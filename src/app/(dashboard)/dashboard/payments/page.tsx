'use client';

import { useState } from 'react';
import { OrderStatus } from '@prisma/client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader } from '@/app/common/loader/loader';
import { feeView } from '@/lib/cod-fee/view';
import { formatBDT } from '@/server/common/money';

import { FeeStatusBadge } from '@/modules/admin/payments/components/fee-status-badge';
import {
  useAdminPendingPayments,
  useVerifyCodFee,
  useVerifyPayment,
} from '@/modules/admin/payments/hooks';
import {
  describeAction,
  makePendingAction,
  type PendingAction,
  type PendingActionKind,
  type PendingActionOutcome,
} from '@/modules/admin/payments/pending-action';

export default function AdminPaymentsPage() {
  const pending = useAdminPendingPayments();
  const verify = useVerifyPayment();
  const verifyFee = useVerifyCodFee();
  const [actingId, setActingId] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const copy = action ? describeAction(action) : null;

  function runAction(a: PendingAction) {
    setActingId(a.id);
    if (a.kind === 'fee') {
      verifyFee.mutate({ id: a.id, outcome: a.outcome });
    } else {
      verify.mutate({ id: a.id, outcome: a.outcome });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Verify cash on delivery and bank-transfer payments awaiting human review.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting verification</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader />
            </div>
          ) : (pending.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments need attention right now.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Txn ID</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Fee status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pending.data ?? []).map((p) => {
                  const busy = actingId === p.id && (verify.isPending || verifyFee.isPending);
                  // The list excludes cancelled orders and carries no order status;
                  // the server re-checks that the order is still PENDING.
                  const fee = feeView(p, {
                    status: OrderStatus.PENDING,
                    totalCents: p.order.totalCents,
                  });
                  const { canVerify, canReject } = fee.admin;
                  const hasFee = fee.show;
                  const ask = <K extends PendingActionKind>(
                    kind: K,
                    outcome: PendingActionOutcome<K>,
                  ) =>
                    setAction(
                      makePendingAction(kind, outcome, {
                        id: p.id,
                        orderNumber: p.order.orderNumber,
                      }),
                    );
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.order.orderNumber}</TableCell>
                      <TableCell>
                        <div>{p.order.shipRecipient}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.order.user?.email ?? p.order.shipPhone}
                        </div>
                      </TableCell>
                      <TableCell>{p.method}</TableCell>
                      <TableCell className="font-mono text-xs">{p.bankRef ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs break-all">
                        {p.customerTxnId ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">{formatBDT(p.amountCents)}</TableCell>
                      <TableCell className="text-right">
                        {hasFee ? formatBDT(p.feeCents) : '—'}
                      </TableCell>
                      <TableCell>
                        {hasFee ? <FeeStatusBadge status={p.feeStatus} /> : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {canVerify ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => ask('fee', 'VERIFIED')}
                            >
                              Verify fee
                            </Button>
                            {/* A rejected fee can still be verified but not rejected again. */}
                            {canReject ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => ask('fee', 'REJECTED')}
                              >
                                Reject fee
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => ask('payment', 'SUCCEEDED')}
                            >
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => ask('payment', 'FAILED')}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
        title={copy?.title ?? ''}
        description={copy?.description ?? ''}
        confirmLabel={copy?.confirmLabel ?? 'Confirm'}
        destructive={copy?.destructive}
        onConfirm={() => {
          if (action) runAction(action);
        }}
      />
    </div>
  );
}
