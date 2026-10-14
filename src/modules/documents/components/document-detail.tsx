'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { IconAlertCircle, IconAlertTriangle, IconCopy, IconDownload, IconPrinter, IconRefresh, IconSend } from '@tabler/icons-react';

import { Loader } from '@/components/common/loader';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_SUBTYPE_LABELS,
  PAYMENT_MEANS_LABELS,
  TAX_CATEGORY_LABELS,
  type DocumentDTO,
  type PartySnapshot,
} from '@/contracts/documents';
import { ApiClientError } from '@/lib/fetcher';

import { formatAmount, printState } from '../format';
import { useDeleteDocument, useDocument, useDuplicateDocument, useIssueDocument, useRetryDocument } from '../hooks';
import { DocumentForm } from './document-form';
import { StatusBadges } from './status-badges';

export function DocumentDetail({ id }: { id: string }) {
  const { data: doc, isLoading, error } = useDocument(id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/app/invoices" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Invoices
        </Link>
        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : doc ? (
          <DetailHeader doc={doc} />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">Document</h1>
        )}
      </div>
      {error ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>
            {error instanceof ApiClientError && error.status === 404 ? 'Document not found' : "Couldn't load this document"}
          </AlertTitle>
          <AlertDescription>
            <Link href="/app/invoices" className="font-medium underline underline-offset-4">
              Back to invoices
            </Link>
          </AlertDescription>
        </Alert>
      ) : doc ? (
        doc.status === 'DRAFT' ? (
          // key: remount with fresh defaults when a copy replaces the view
          <DocumentForm key={doc.id} kind={doc.kind} draft={doc} />
        ) : (
          <IssuedView doc={doc} />
        )
      ) : (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading document">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailHeader({ doc }: { doc: DocumentDTO }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remove = useDeleteDocument(doc.id);
  const duplicate = useDuplicateDocument(doc.id);
  const issue = useIssueDocument(doc.id);
  const retry = useRetryDocument(doc.id);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const print = printState(doc);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {DOCUMENT_KIND_LABELS[doc.kind]} <span className="tabular-nums">{doc.number ?? '(draft)'}</span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadges status={doc.status} submissionStatus={doc.submissionStatus} isTest={doc.isTest} />
          <span className="text-sm text-muted-foreground">{DOCUMENT_SUBTYPE_LABELS[doc.subtype]}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {print.allowed ? (
          <Button asChild variant="outline">
            <Link href={`/app/invoices/${doc.id}/print`}>
              <IconPrinter />
              Print view
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled title={print.reason}>
            <IconPrinter />
            Print view
          </Button>
        )}
        {doc.status === 'ISSUED' ? (
          <Button asChild variant="outline">
            <a href={`/api/app/documents/${doc.id}/xml`} download>
              <IconDownload />
              Download XML
            </a>
          </Button>
        ) : null}
        {doc.submissionStatus === 'PENDING_RETRY' ? (
          <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? <Loader /> : <IconRefresh />}
            Retry submission
          </Button>
        ) : null}
        <Button
          variant={doc.submissionStatus === 'REJECTED' ? 'default' : 'outline'}
          disabled={duplicate.isPending}
          onClick={() => duplicate.mutate(undefined, { onSuccess: (copy) => router.push(`/app/invoices/${copy.id}`) })}
        >
          {duplicate.isPending ? <Loader /> : <IconCopy />}
          {doc.submissionStatus === 'REJECTED' ? 'Create corrected copy' : 'Duplicate as draft'}
        </Button>
        {doc.status === 'DRAFT' ? (
          <>
            <Button disabled={issue.isPending} onClick={() => setConfirmIssue(true)}>
              {issue.isPending ? <Loader /> : <IconSend />}
              Issue to ZATCA
            </Button>
            <ConfirmDialog
              open={confirmIssue}
              onOpenChange={setConfirmIssue}
              title="Issue this document?"
              description="It gets its number, is signed and sent to ZATCA. Issued documents can't be changed or deleted. The saved draft is issued, so save any edits first."
              confirmLabel="Issue"
              onConfirm={() => issue.mutate()}
            />
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete draft
            </Button>
            <ConfirmDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete this draft?"
              description="The draft and its lines are removed. This can't be undone."
              confirmLabel="Delete"
              destructive
              onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.push('/app/invoices') })}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Party({ title, party }: { title: string; party: PartySnapshot | null }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm text-muted-foreground">{title}</h2>
      {party ? (
        <>
          <p className="font-medium">{party.name}</p>
          {party.nameAr ? (
            <p dir="rtl" lang="ar" className="text-left">
              {party.nameAr}
            </p>
          ) : null}
          {party.vatNumber ? <p className="text-sm tabular-nums">VAT {party.vatNumber}</p> : null}
          <p className="text-sm text-muted-foreground">
            {[party.address.street, party.address.district, party.address.city].filter(Boolean).join(', ')}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">Walk-in buyer</p>
      )}
    </div>
  );
}

/** Read-only view of an issued document (an issued document is never edited). */
function IssuedView({ doc }: { doc: DocumentDTO }) {
  return (
    <div className="flex flex-col gap-8">
      <SubmissionPanel doc={doc} />
      <p className="text-sm text-muted-foreground">
        Issued documents can&apos;t be changed. To correct one, issue a credit or debit note, or duplicate it as a new draft.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <Party title="Seller" party={doc.seller} />
        <Party title="Buyer" party={doc.buyer} />
      </div>
      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <Fact label="Issue date" value={doc.issueDate} />
        <Fact label="Supply date" value={doc.supplyDate} />
        <Fact label="Payment method" value={doc.paymentMeansCode ? PAYMENT_MEANS_LABELS[doc.paymentMeansCode] : null} />
        {doc.billingReference ? <Fact label="Original invoice" value={doc.billingReference.number} /> : null}
        {doc.noteReason ? <Fact label="Reason" value={doc.noteReason} /> : null}
      </dl>
      <div className="overflow-x-auto border">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-2 font-medium">Description</th>
              <th className="p-2 text-right font-medium">Qty</th>
              <th className="p-2 text-right font-medium">Unit price</th>
              <th className="p-2 text-right font-medium">VAT</th>
              <th className="p-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="p-2">
                  {l.description}
                  <span className="block text-xs text-muted-foreground">{TAX_CATEGORY_LABELS[l.taxCategory]}</span>
                </td>
                <td className="p-2 text-right">{l.quantity}</td>
                <td className="p-2 text-right">{formatAmount(l.unitPriceHalalas)}</td>
                <td className="p-2 text-right">{formatAmount(l.vatHalalas)}</td>
                <td className="p-2 text-right">{formatAmount(l.totalHalalas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto flex w-full max-w-sm flex-col gap-2 text-sm tabular-nums">
        <Total label="Subtotal (excl. VAT)" value={doc.lineExtensionHalalas} />
        {doc.allowanceTotalHalalas ? <Total label="Discount" value={doc.allowanceTotalHalalas} /> : null}
        <Total label="VAT" value={doc.taxHalalas} />
        <div className="flex justify-between border-t pt-3 text-lg font-semibold">
          <dt>Total</dt>
          <dd>{formatAmount(doc.payableHalalas)} SAR</dd>
        </div>
      </dl>
    </div>
  );
}

const Fact = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{value ?? '-'}</dd>
  </div>
);

const Total = ({ label, value }: { label: string; value: number }) => (
  <div className="flex justify-between">
    <dt className="text-muted-foreground">{label}</dt>
    <dd>{formatAmount(value)}</dd>
  </div>
);

/** ZATCA's verdict in words: errors and warnings from the last response, and what to do next. */
function SubmissionPanel({ doc }: { doc: DocumentDTO }) {
  const { submissionStatus: s } = doc;
  const attempts = `${doc.submissionAttempts} attempt${doc.submissionAttempts === 1 ? '' : 's'}`;
  if (s === 'NOT_SUBMITTED') return null;
  if (s === 'REPORTED' || s === 'CLEARED') {
    return (
      <div className="flex flex-col gap-2" data-testid="submission-panel">
        <p className="text-sm text-muted-foreground">
          {s === 'CLEARED' ? 'Cleared' : 'Reported'} by ZATCA ({attempts}).
        </p>
        {doc.hasWarnings ? <Messages title="ZATCA warnings" items={doc.submissionWarnings} /> : null}
      </div>
    );
  }
  return (
    <Alert variant={s === 'REJECTED' ? 'destructive' : 'default'} data-testid="submission-panel">
      {s === 'REJECTED' ? <IconAlertCircle /> : <IconAlertTriangle />}
      <AlertTitle>{s === 'REJECTED' ? 'Rejected by ZATCA' : 'Not yet accepted by ZATCA'}</AlertTitle>
      <AlertDescription>
        {s === 'REJECTED' ? (
          <>
            <p>This document is final and keeps its number. Create a corrected copy to issue a replacement.</p>
            <Messages items={doc.submissionErrors} />
          </>
        ) : (
          <>
            <p>
              The signed document is saved ({attempts}).{doc.reonboardRequired ? '' : ' Use Retry submission; a daily job also retries it.'}
              {doc.subtype === 'SIMPLIFIED'
                ? ' Simplified invoices must be reported within 24 hours of issue.'
                : ' The buyer must not receive it until ZATCA clears it.'}
            </p>
            {doc.reonboardRequired ? (
              <p className="mt-1 font-medium">
                ZATCA refused the unit&apos;s credentials: re-onboard required.{' '}
                <Link href="/app/zatca" className="underline underline-offset-4">
                  Open ZATCA setup
                </Link>
              </p>
            ) : null}
            <Messages items={doc.submissionErrors} />
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

function Messages({ title, items }: { title?: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      {title ? <p className="text-sm font-medium">{title}</p> : null}
      <ul className="list-disc pl-5 text-sm">
        {items.map((m, i) => (
          <li key={i} className="break-words">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
