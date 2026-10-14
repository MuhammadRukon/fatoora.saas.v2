import type { Metadata } from 'next';

import { SubmissionStatus } from '@prisma/client';

import { auth } from '@/auth';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';
import { DocumentList } from '@/modules/documents/components/document-list';

export const metadata: Metadata = { title: 'Invoices' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ submissionStatus?: string }> }) {
  const { submissionStatus } = await searchParams;
  const initial = Object.values(SubmissionStatus).find((s) => s === submissionStatus);
  const session = await auth();
  const readOnly = !!session?.user && (await subscriptionsService.getState(session.user.id)).state === 'EXPIRED';
  return <DocumentList initialSubmissionStatus={initial} readOnly={readOnly} />;
}
