import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/auth';
import { NotFoundError } from '@/server/common/errors';
import { resolveBusinessId } from '@/server/business/business-context';
import { documentsService } from '@/server/documents/documents.service';
import { DocumentPrint } from '@/modules/documents/components/document-print';

export const metadata: Metadata = { title: 'Print document' };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { id } = await params;
  const businessId = await resolveBusinessId(session.user.id);
  const doc = await documentsService.get(businessId, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return <DocumentPrint doc={doc} backHref={`/app/invoices/${id}`} />;
}
