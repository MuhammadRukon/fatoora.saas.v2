import type { Metadata } from 'next';

import { getSession } from '@/lib/session';
import { cachedSubscriptionState } from '@/server/subscriptions/cached';
import { DocumentDetail } from '@/modules/documents/components/document-detail';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const readOnly = !!session?.user && (await cachedSubscriptionState(session.user.id)).state === 'EXPIRED';
  return <DocumentDetail id={id} readOnly={readOnly} />;
}
