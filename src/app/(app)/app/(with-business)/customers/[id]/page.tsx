import type { Metadata } from 'next';

import { CustomerEdit } from '@/modules/customers/components/customer-edit';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerEdit id={id} />;
}
