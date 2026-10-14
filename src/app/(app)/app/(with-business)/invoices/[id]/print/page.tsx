import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { NotFoundError } from '@/server/common/errors';
import { cachedBusinessId } from '@/server/business/cached';
import { documentsService } from '@/server/documents/documents.service';
import { DocumentPrint } from '@/modules/documents/components/document-print';
import { printState } from '@/modules/documents/format';

export const metadata: Metadata = { title: 'Print document' };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const { id } = await params;
  const businessId = await cachedBusinessId(session.user.id);
  const doc = await documentsService.get(businessId, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const showQr = doc.status === 'ISSUED' && !!doc.qrBase64 && printState(doc).allowed;
  const qrDataUrl = showQr ? await QRCode.toDataURL(doc.qrBase64!, { errorCorrectionLevel: 'M', margin: 1, width: 240 }) : null;
  return <DocumentPrint doc={doc} backHref={`/app/invoices/${id}`} qrDataUrl={qrDataUrl} />;
}
