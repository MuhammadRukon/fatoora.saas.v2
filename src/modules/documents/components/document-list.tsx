'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { IconAlertCircle, IconChevronDown, IconFileInvoice, IconPlus, IconSearch } from '@tabler/icons-react';
import type { DocumentKind, DocumentStatus, SubmissionStatus } from '@prisma/client';

import { Loader } from '@/components/common/loader';
import { DataTable } from '@/components/data-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_SUBTYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  type DocumentListItemDTO,
} from '@/contracts/documents';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { formatAmount } from '../format';
import { useDocuments } from '../hooks';
import { StatusBadges } from './status-badges';

const TABS: { value: 'ALL' | DocumentKind; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'INVOICE', label: 'Invoices' },
  { value: 'CREDIT_NOTE', label: 'Credit notes' },
  { value: 'DEBIT_NOTE', label: 'Debit notes' },
];

const columns: ColumnDef<DocumentListItemDTO, unknown>[] = [
  {
    accessorKey: 'number',
    header: 'Number',
    cell: ({ row: { original: d } }) => (
      <Link href={`/app/invoices/${d.id}`} className="font-medium tabular-nums underline-offset-4 hover:underline">
        {d.number ?? <span className="text-muted-foreground">Draft</span>}
      </Link>
    ),
  },
  {
    id: 'type',
    header: 'Type',
    accessorFn: (d) => d.kind,
    cell: ({ row: { original: d } }) => (
      <div className="flex flex-col">
        <span>{DOCUMENT_KIND_LABELS[d.kind]}</span>
        <span className="text-sm text-muted-foreground">{DOCUMENT_SUBTYPE_LABELS[d.subtype]}</span>
      </div>
    ),
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => row.original.customerName ?? <span className="text-muted-foreground">Walk-in</span>,
  },
  {
    id: 'date',
    header: 'Date',
    accessorFn: (d) => d.issueDate ?? d.createdAt,
    cell: ({ row: { original: d } }) => <span className="tabular-nums">{d.issueDate ?? d.createdAt.slice(0, 10)}</span>,
  },
  {
    accessorKey: 'payableHalalas',
    header: () => <span className="block text-right">Total (SAR)</span>,
    cell: ({ row }) => <span className="block text-right tabular-nums">{formatAmount(row.original.payableHalalas)}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    accessorFn: (d) => d.status,
    cell: ({ row: { original: d } }) => <StatusBadges status={d.status} submissionStatus={d.submissionStatus} isTest={d.isTest} />,
  },
];

const ANY = '__any';

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  options: Record<T, string>;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : (v as T))}>
      <SelectTrigger aria-label={label} className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {Object.entries<string>(options).map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DocumentList({
  initialSubmissionStatus,
  readOnly = false,
}: {
  initialSubmissionStatus?: SubmissionStatus;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<'ALL' | DocumentKind>('ALL');
  const [status, setStatus] = useState<DocumentStatus>();
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | undefined>(initialSubmissionStatus);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim());

  const filters = { kind: tab === 'ALL' ? undefined : tab, status, submissionStatus, q: q || undefined };
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useDocuments(filters);
  const docs = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const unfiltered = !q && !status && !submissionStatus && tab === 'ALL';
  const noneYet = !isLoading && !isError && unfiltered && docs.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">Invoices, credit notes and debit notes.</p>
        </div>
        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <IconPlus />
                New
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const).map((kind) => (
                <DropdownMenuItem key={kind} asChild>
                  <Link href={`/app/invoices/new?kind=${kind}`}>{DOCUMENT_KIND_LABELS[kind]}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {noneYet ? (
        <div className="flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center">
          <IconFileInvoice className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="font-medium">No invoices yet</h2>
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">
            Start with a draft. Drafts can be edited freely until they are issued to ZATCA.
          </p>
          {readOnly ? null : (
            <Button asChild variant="outline" className="mt-2">
              <Link href="/app/invoices/new?kind=INVOICE">Create your first invoice</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-sm">
              <IconSearch
                className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                aria-label="Search documents"
                placeholder="Search by number or customer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <FilterSelect label="Status" value={status} onChange={setStatus} options={DOCUMENT_STATUS_LABELS} />
            <FilterSelect label="ZATCA" value={submissionStatus} onChange={setSubmissionStatus} options={SUBMISSION_STATUS_LABELS} />
          </div>

          {isError ? (
            <Alert variant="destructive">
              <IconAlertCircle />
              <AlertTitle>Couldn&apos;t load documents</AlertTitle>
              <AlertDescription>Refresh the page to try again.</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading documents">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No documents match these filters.</p>
          ) : (
            <DataTable data={docs} columns={columns} />
          )}

          {hasNextPage ? (
            <Button variant="outline" className="self-center" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
              {isFetchingNextPage ? <Loader /> : 'Load more documents'}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
