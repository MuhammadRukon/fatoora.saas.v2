import type { Metadata } from 'next';

import { CustomerForm } from '@/modules/customers/components/customer-form';

export const metadata: Metadata = { title: 'New customer' };

export default function NewCustomerPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">New customer</h1>
      <CustomerForm />
    </div>
  );
}
