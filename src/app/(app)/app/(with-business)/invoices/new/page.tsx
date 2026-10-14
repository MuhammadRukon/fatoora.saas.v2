import type { Metadata } from 'next';
import Link from 'next/link';
import { DocumentKind } from '@prisma/client';

import { DOCUMENT_KIND_LABELS } from '@/contracts/documents';
import { DocumentForm } from '@/modules/documents/components/document-form';

export const metadata: Metadata = { title: 'New invoice' };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: raw } = await searchParams;
  const kind = (Object.values(DocumentKind) as string[]).includes(raw ?? '') ? (raw as DocumentKind) : 'INVOICE';
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/app/invoices" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Invoices
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New {DOCUMENT_KIND_LABELS[kind].toLowerCase()}</h1>
      </div>
      {/* key: switching kind in the URL remounts with fresh defaults */}
      <DocumentForm key={kind} kind={kind} />
    </div>
  );
}
