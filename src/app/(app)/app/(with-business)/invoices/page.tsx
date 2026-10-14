import type { Metadata } from 'next';

import { SubmissionStatus } from '@prisma/client';

import { getSession } from '@/lib/session';
import { cachedSubscriptionState } from '@/server/subscriptions/cached';
import { DocumentList } from '@/modules/documents/components/document-list';

export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ submissionStatus?: string }> }) {
  const { submissionStatus } = await searchParams;
  const initial = Object.values(SubmissionStatus).find((s) => s === submissionStatus);
  const session = await getSession();
  const readOnly = !!session?.user && (await cachedSubscriptionState(session.user.id)).state === 'EXPIRED';
  return <DocumentList initialSubmissionStatus={initial} readOnly={readOnly} />;
}
