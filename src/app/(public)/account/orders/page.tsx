'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { Card, CardContent } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';
import { formatBDT } from '@/server/common/money';

import { useMyOrders } from '@/modules/orders/hooks';
import { OrderStatusBadge } from '@/modules/orders/components/order-status-badge';

export default function MyOrdersPage() {
  const router = useRouter();
  const { status } = useSession();
  const orders = useMyOrders();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=/account/orders');
    }
  }, [status, router]);

  if (status !== 'authenticated' || orders.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }

  const items = orders.data ?? [];

  return (
    <div className="space-y-4 py-6">
      <h1 className="text-2xl font-semibold">My orders</h1>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No orders yet.{' '}
            <Link href="/products" className="underline">
              Start shopping
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`}>
                <Card className="hover:bg-muted/30">
                  <CardContent className="flex items-start justify-between gap-4 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{o.orderNumber}</span>
                        <OrderStatusBadge status={o.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Placed on {new Date(o.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {o.items.length} item{o.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-sm font-semibold">{formatBDT(o.totalCents)}</div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
