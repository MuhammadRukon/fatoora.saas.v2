'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { OrderStatus } from '@prisma/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader } from '@/app/common/loader/loader';
import { formatBDT } from '@/server/common/money';
import { OrderStatusBadge } from '@/modules/orders/components/order-status-badge';

import { useAdminOrdersList } from '@/modules/admin/orders/hooks';

const STATUS_FILTERS: Array<{ id: OrderStatus | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'CONFIRMED', label: 'Confirmed' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'SHIPPED', label: 'Shipped' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

export default function AdminOrdersPage() {
  const orders = useAdminOrdersList();
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const items = orders.data ?? [];
    return items.filter((o) => {
      if (filter !== 'ALL' && o.status !== filter) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const haystack =
          `${o.orderNumber} ${o.shipRecipient} ${o.shipPhone} ${o.user?.email ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders.data, filter, query]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setFilter(s.id)}
                className={`rounded border px-3 py-1 text-sm ${
                  filter === s.id ? 'border-primary bg-primary/10' : ''
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <Input
            placeholder="Search by order number, name, phone, or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {orders.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader />
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No orders match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer">
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/orders/${o.id}`} className="hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{o.shipRecipient}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.user?.email ?? o.shipPhone}
                      </div>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>{o.items.length}</TableCell>
                    <TableCell className="text-right">{formatBDT(o.totalCents)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
