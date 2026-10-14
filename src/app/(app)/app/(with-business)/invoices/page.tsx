import type { Metadata } from 'next';

import { SubmissionStatus } from '@prisma/client';

import { DocumentList } from '@/modules/documents/components/document-list';

export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ submissionStatus?: string }> }) {
  const { submissionStatus } = await searchParams;
  const initial = Object.values(SubmissionStatus).find((s) => s === submissionStatus);
  return <DocumentList initialSubmissionStatus={initial} />;
}
