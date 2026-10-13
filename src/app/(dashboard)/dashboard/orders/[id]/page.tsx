'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { OrderStatus } from '@prisma/client';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';
import { Textarea } from '@/components/ui/textarea';
import { feeView } from '@/lib/cod-fee/view';
import { primaryPayment } from '@/lib/primary-payment';
import { formatShipAddress } from '@/modules/orders/components/format-ship-address';
import { OrderEventsCard } from '@/modules/orders/components/order-events-card';
import { OrderItemsCard } from '@/modules/orders/components/order-items-card';
import { OrderStatusBadge } from '@/modules/orders/components/order-status-badge';
import { OrderTotalsRows } from '@/modules/orders/components/order-totals-rows';
import { CodFeePanel } from '@/modules/admin/payments/components/cod-fee-panel';

import { useAdminOrderDetail, useTransitionOrder } from '@/modules/admin/orders/hooks';

const STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

const getNextStatus = (current: OrderStatus): OrderStatus | null => {
  const index = STATUSES.indexOf(current);
  return index >= 0 && index < STATUSES.length - 1 ? STATUSES[index + 1] : null;
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const order = useAdminOrderDetail(id);
  const transition = useTransitionOrder(id ?? '');
  const [note, setNote] = useState('');
  const [waiveOpen, setWaiveOpen] = useState(false);

  if (order.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }
  if (order.error || !order.data) {
    return (
      <div className="p-6">
        <p>Could not load this order.</p>
        <Link href="/dashboard/orders" className="underline">
          Back to orders
        </Link>
      </div>
    );
  }

  const o = order.data;
  const nextStatus = getNextStatus(o.status);
  const payment = primaryPayment(o);
  const fee = feeView(payment, o);
  const feePayment = fee.show ? payment : null;
  // Confirming by hand while the fee is unverified (or rejected) waives it server-side.
  const confirmWaivesFee = fee.admin.confirmWaivesFee;

  function runTransition(status: OrderStatus) {
    transition.mutate({ status, note: note || undefined }, { onSuccess: () => setNote('') });
  }
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Order {o.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {new Date(o.createdAt).toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{o.shipRecipient}</p>
            <p>{o.user?.email}</p>
            <p>{o.shipPhone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{formatShipAddress(o)}</p>
          </CardContent>
        </Card>
      </div>

      <OrderItemsCard items={o.items} />

      {feePayment ? <CodFeePanel order={o} payment={feePayment} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <OrderTotalsRows order={o} fee={fee} mutedFee />
            <p className="pt-2 text-xs text-muted-foreground">
              Payment: {o.payments.map((p) => `${p.method} (${p.status})`).join(', ') || 'Pending'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Update status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note (visible to the customer)"
            />
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => {
                const isNext = s === nextStatus;
                const isCancelled = s === OrderStatus.CANCELLED;

                return (
                  <Button
                    key={s}
                    size="sm"
                    variant={o.status === s ? 'default' : 'outline'}
                    disabled={o.status === s || transition.isPending || (!isNext && !isCancelled)}
                    onClick={() => {
                      if (s === OrderStatus.CONFIRMED && confirmWaivesFee) {
                        setWaiveOpen(true);
                        return;
                      }
                      runTransition(s);
                    }}
                  >
                    {s}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={waiveOpen}
        onOpenChange={setWaiveOpen}
        title="Confirmation fee not verified"
        description="Confirmation fee not verified. Confirming will waive it. The order will be confirmed and the fee marked as waived."
        confirmLabel="Confirm and waive fee"
        onConfirm={() => runTransition(OrderStatus.CONFIRMED)}
      />

      <OrderEventsCard title="Audit trail" events={o.events} />
    </div>
  );
}
