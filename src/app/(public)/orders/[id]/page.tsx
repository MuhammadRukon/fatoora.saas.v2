'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { OrderStatus } from '@prisma/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';
import { feeView } from '@/lib/cod-fee/view';
import { primaryPayment } from '@/lib/primary-payment';
import { usePaymentConfig } from '@/modules/checkout/hooks';
import { useOrderDetail } from '@/modules/orders/hooks';
import { CancelOrderCard } from '@/modules/orders/components/cancel-order-card';
import { FeeSection } from '@/modules/orders/components/order-fee-section';
import { formatShipAddress } from '@/modules/orders/components/format-ship-address';
import { OrderEventsCard } from '@/modules/orders/components/order-events-card';
import { OrderItemsCard } from '@/modules/orders/components/order-items-card';
import { OrderStatusBadge } from '@/modules/orders/components/order-status-badge';
import { OrderTotalsRows } from '@/modules/orders/components/order-totals-rows';
import { WarrantyRequestCard } from '@/modules/orders/components/warranty-request-card';

const CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { status } = useSession();
  const order = useOrderDetail(id);
  const feePayment = order.data ? primaryPayment(order.data) : undefined;
  const fee = order.data ? feeView(feePayment, order.data) : null;
  const feeState = fee?.customerNotice ?? 'none';
  // Contact/QR/note are only needed while the fee is actionable.
  const config = usePaymentConfig({ enabled: feeState === 'pending' || feeState === 'rejected' });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?callbackUrl=/orders/${id ?? ''}`);
    }
  }, [status, router, id]);

  if (status !== 'authenticated' || order.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }
  if (order.error || !order.data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          We couldn&apos;t load this order.{' '}
          <Link href="/account/orders" className="underline">
            View all orders
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const o = order.data;
  const payment = primaryPayment(o);
  const canCancel = CANCELLABLE.includes(o.status);
  const canRequestWarranty = o.status === 'DELIVERED';

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Order {o.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed on {new Date(o.createdAt).toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>

      {feeState !== 'none' && feePayment ? (
        <FeeSection state={feeState} payment={feePayment} config={config} />
      ) : null}

      <OrderItemsCard items={o.items} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Delivery</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{o.shipRecipient}</p>
            <p className="text-muted-foreground">{o.shipPhone}</p>
            <p className="text-muted-foreground">{formatShipAddress(o)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {fee ? <OrderTotalsRows order={o} fee={fee} /> : null}
            <p className="pt-2 text-xs text-muted-foreground">
              Payment:{' '}
              {payment ? `${payment.method} (${payment.status})` : 'Pending'}
            </p>
          </CardContent>
        </Card>
      </div>

      <OrderEventsCard title="Tracking" events={o.events} />

      {canCancel ? <CancelOrderCard orderId={id ?? ''} /> : null}

      {canRequestWarranty ? <WarrantyRequestCard orderId={id ?? ''} /> : null}
    </div>
  );
}
