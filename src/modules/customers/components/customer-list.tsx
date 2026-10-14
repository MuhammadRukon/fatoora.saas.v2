'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { IconAlertCircle, IconPlus, IconSearch, IconUsers } from '@tabler/icons-react';

import { Loader } from '@/components/common/loader';
import { DataTable } from '@/components/data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { BUYER_ID_SCHEME_LABELS, type CustomerDTO } from '@/contracts/customers';
import { useCustomers } from '@/modules/customers/hooks';

const columns: ColumnDef<CustomerDTO, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="flex flex-col">
        <Link
          href={`/app/customers/${row.original.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.name}
        </Link>
        {row.original.nameAr ? (
          <span dir="rtl" lang="ar" className="text-left text-sm text-muted-foreground">
            {row.original.nameAr}
          </span>
        ) : null}
      </div>
    ),
  },
  {
    id: 'taxId',
    header: 'Tax ID',
    accessorFn: (c) => c.vatNumber ?? c.buyerIdValue ?? '',
    cell: ({ row: { original: c } }) =>
      c.vatNumber ? (
        <span className="tabular-nums">
          <span className="text-muted-foreground">VAT </span>
          {c.vatNumber}
        </span>
      ) : c.buyerIdScheme ? (
        <span className="tabular-nums">
          <span className="text-muted-foreground">{BUYER_ID_SCHEME_LABELS[c.buyerIdScheme]} </span>
          {c.buyerIdValue}
        </span>
      ) : (
        <span className="text-muted-foreground">None</span>
      ),
  },
  {
    accessorKey: 'city',
    header: 'City',
    cell: ({ row }) => row.original.city ?? <span className="text-muted-foreground">-</span>,
  },
  {
    id: 'contact',
    header: 'Contact',
    accessorFn: (c) => c.email ?? c.phone ?? '',
    cell: ({ row: { original: c } }) =>
      c.email || c.phone ? (
        <div className="flex flex-col text-sm">
          {c.email ? <span>{c.email}</span> : null}
          {c.phone ? <span className="text-muted-foreground tabular-nums">{c.phone}</span> : null}
        </div>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

export function CustomerList() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useCustomers(q);
  const customers = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const noCustomersYet = !isLoading && !isError && !q && customers.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">The businesses and people you invoice.</p>
        </div>
        <Button asChild>
          <Link href="/app/customers/new">
            <IconPlus />
            New customer
          </Link>
        </Button>
      </div>

      {noCustomersYet ? (
        <div className="flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center">
          <IconUsers className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">No customers yet</h2>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Add a customer once and pick it on every invoice. Simplified (B2C) invoices can also go to
            walk-in buyers without a customer record.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/app/customers/new">Add your first customer</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="relative max-w-sm">
            <IconSearch
              className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label="Search customers"
              placeholder="Search by name or VAT number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isError ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>Couldn&apos;t load customers</AlertTitle>
              <AlertDescription>Refresh the page to try again.</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading customers">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DataTable data={customers} columns={columns} />
          )}

          {hasNextPage ? (
            <Button
              variant="outline"
              className="self-center"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? <Loader /> : 'Load more customers'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
