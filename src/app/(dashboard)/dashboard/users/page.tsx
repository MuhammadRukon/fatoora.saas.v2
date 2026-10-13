'use client';

import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { planLabel, type SubscriptionStateName } from '@/contracts/subscriptions';
import { formatDate } from '@/lib/utils';
import { useActivateSubscription, useAdminUsers } from '@/modules/admin/users/hooks';
import type { AdminUser } from '@/server/users/users.service';

const STATE_BADGE: Record<SubscriptionStateName, { label: string; className: string }> = {
  ACTIVE: {
    label: 'Active',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
  },
  PENDING: {
    label: 'Pending',
    className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  },
  EXPIRED: { label: 'Expired', className: 'text-muted-foreground' },
  NONE: { label: 'None', className: 'border-dashed text-muted-foreground' },
};

const dash = <span className="text-muted-foreground">-</span>;

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useAdminUsers();
  const activate = useActivateSubscription();
  const [confirming, setConfirming] = useState<AdminUser | null>(null);
  const pending = confirming?.subscriptionState.pending;

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {/* Initials only: next.config has no remote image hosts. */}
          <span
            aria-hidden
            className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium"
          >
            {(row.original.name || row.original.email).charAt(0).toUpperCase()}
          </span>
          <span className="font-medium">{row.original.name || 'N/A'}</span>
          {row.original.role === 'ADMIN' ? <Badge variant="outline">Admin</Badge> : null}
        </div>
      ),
    },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'emailVerified',
      header: 'Verified',
      cell: ({ row }) => (row.original.emailVerified ? 'Yes' : 'No'),
    },
    {
      accessorKey: 'createdAt',
      header: 'Joined',
      cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: 'subscription',
      accessorFn: (u) => u.subscriptionState.state,
      header: 'Subscription',
      cell: ({ row }) => {
        const badge = STATE_BADGE[row.original.subscriptionState.state];
        return (
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        );
      },
    },
    {
      id: 'latestPlan',
      accessorFn: (u) => u.subscriptions[0]?.plan ?? '',
      header: 'Latest plan',
      cell: ({ row }) => {
        const latest = row.original.subscriptions[0];
        return latest ? planLabel(latest.plan) : dash;
      },
    },
    {
      id: 'requestedAt',
      accessorFn: (u) => u.subscriptions[0]?.createdAt ?? '',
      header: 'Requested at',
      cell: ({ row }) => {
        const latest = row.original.subscriptions[0];
        return latest ? <span className="tabular-nums">{formatDate(latest.createdAt)}</span> : dash;
      },
    },
    {
      id: 'activeUntil',
      accessorFn: (u) => u.subscriptionState.activeUntil ?? '',
      header: 'Active until',
      cell: ({ row }) => {
        const until = row.original.subscriptionState.activeUntil;
        return until ? <span className="tabular-nums">{formatDate(until)}</span> : dash;
      },
    },
    {
      id: 'actions',
      header: 'Action',
      cell: ({ row }) =>
        row.original.subscriptionState.pending ? (
          <Button
            size="sm"
            onClick={() => setConfirming(row.original)}
            disabled={activate.isPending}
          >
            Activate
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable columns={columns} data={isLoading ? [] : users} />
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Activate subscription?"
        description={
          pending && confirming
            ? `${confirming.name || confirming.email} gets ${planLabel(pending.plan)} of access, starting now or after their current period ends.`
            : ''
        }
        confirmLabel="Activate"
        onConfirm={() => pending && activate.mutate(pending.id)}
      />
    </>
  );
}
