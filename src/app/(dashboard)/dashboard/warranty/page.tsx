'use client';

import Link from 'next/link';
import { useState } from 'react';
import { WarrantyStatus } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';
import { Textarea } from '@/components/ui/textarea';

import {
  useAdminWarrantyList,
  useTransitionWarranty,
} from '@/modules/warranty/hooks';

const FILTERS: Array<{ id: WarrantyStatus | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: WarrantyStatus.OPEN, label: 'Open' },
  { id: WarrantyStatus.APPROVED, label: 'Approved' },
  { id: WarrantyStatus.REJECTED, label: 'Rejected' },
  { id: WarrantyStatus.RESOLVED, label: 'Resolved' },
];

const NEXT_STATUSES: Record<WarrantyStatus, WarrantyStatus[]> = {
  OPEN: [WarrantyStatus.APPROVED, WarrantyStatus.REJECTED],
  APPROVED: [WarrantyStatus.RESOLVED, WarrantyStatus.REJECTED],
  REJECTED: [],
  RESOLVED: [],
};

export default function AdminWarrantyPage() {
  const [filter, setFilter] = useState<WarrantyStatus | 'ALL'>(WarrantyStatus.OPEN);
  const list = useAdminWarrantyList(filter === 'ALL' ? undefined : filter);
  const transition = useTransitionWarranty();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Warranty requests</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded border px-3 py-1 text-sm ${
              filter === f.id ? 'border-primary bg-primary/10' : ''
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader />
        </div>
      ) : (list.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No warranty requests in this state.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(list.data ?? []).map((w) => {
            const candidates = NEXT_STATUSES[w.status];
            const resolution = resolutions[w.id] ?? w.resolution ?? '';
            return (
              <li key={w.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">
                        Order{' '}
                        <Link
                          href={`/dashboard/orders/${w.order.id}`}
                          className="hover:underline"
                        >
                          {w.order.orderNumber}
                        </Link>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {w.user?.name ?? 'Customer'} · {w.user?.email}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">{w.status}</span>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm whitespace-pre-line">{w.reason}</p>
                    {candidates.length > 0 ? (
                      <>
                        <Textarea
                          rows={2}
                          placeholder="Resolution / note for the customer"
                          value={resolution}
                          onChange={(e) =>
                            setResolutions((r) => ({ ...r, [w.id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          {candidates.map((next) => (
                            <Button
                              key={next}
                              size="sm"
                              variant="outline"
                              disabled={transition.isPending}
                              onClick={() =>
                                transition.mutate({
                                  id: w.id,
                                  status: next,
                                  resolution: resolution || undefined,
                                })
                              }
                            >
                              Mark {next}
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : w.resolution ? (
                      <p className="text-xs text-muted-foreground">
                        Resolution: {w.resolution}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
