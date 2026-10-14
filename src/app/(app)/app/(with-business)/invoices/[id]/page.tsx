import type { Metadata } from 'next';

import { auth } from '@/auth';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';
import { DocumentDetail } from '@/modules/documents/components/document-detail';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const readOnly = !!session?.user && (await subscriptionsService.getState(session.user.id)).state === 'EXPIRED';
  return <DocumentDetail id={id} readOnly={readOnly} />;
}
