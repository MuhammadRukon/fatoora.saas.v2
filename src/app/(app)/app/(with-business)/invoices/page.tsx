import type { Metadata } from 'next';

import { DocumentList } from '@/modules/documents/components/document-list';

export const metadata: Metadata = { title: 'Invoices' };

export default function InvoicesPage() {
  return <DocumentList />;
}
