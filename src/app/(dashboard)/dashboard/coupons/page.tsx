'use client';

import { useState } from 'react';
import { CouponType, type Coupon } from '@prisma/client';

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
import { formatBDT } from '@/server/common/money';

import { CouponForm } from '@/modules/admin/coupons/components/coupon-form';
import { useAdminCoupons, useCouponMutations } from '@/modules/admin/coupons/hooks';

function describeValue(c: Coupon): string {
  if (c.type === CouponType.PERCENT) return `${c.value}% off`;
  return `${formatBDT(c.value)} off`;
}

function describeWindow(c: Coupon): string {
  if (!c.startsAt && !c.expiresAt) return 'Always';
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString() : '—');
  return `${fmt(c.startsAt)} → ${fmt(c.expiresAt)}`;
}

export default function AdminCouponsPage() {
  const list = useAdminCoupons();
  const { remove } = useCouponMutations();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Coupons</h1>
        {!creating && !editing ? (
          <Button onClick={() => setCreating(true)}>New coupon</Button>
        ) : null}
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>New coupon</CardTitle>
          </CardHeader>
          <CardContent>
            <CouponForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit coupon</CardTitle>
          </CardHeader>
          <CardContent>
            <CouponForm
              initial={editing}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader />
            </div>
          ) : (list.data ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No coupons configured yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min subtotal</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{describeValue(c)}</TableCell>
                    <TableCell>{formatBDT(c.minSubtotalCents)}</TableCell>
                    <TableCell className="text-xs">{describeWindow(c)}</TableCell>
                    <TableCell className="text-xs">
                      {c.usedCount}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          c.isActive
                            ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!editing}
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(c.id)}
                      >
                        Remove
                      </Button>
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
