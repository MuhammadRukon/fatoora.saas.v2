import type { Metadata } from 'next';
import { IconBuildingStore } from '@tabler/icons-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BusinessForm } from '@/modules/business/components/business-form';

export const metadata: Metadata = { title: 'Business profile' };

export default async function BusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const setup = (await searchParams).setup === '1';

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Business profile</h1>
        <p className="text-muted-foreground">The seller details on every invoice you issue.</p>
      </div>
      {setup ? (
        <Alert>
          <IconBuildingStore />
          <AlertTitle>Set up your business to get started</AlertTitle>
          <AlertDescription>
            Customers and invoices belong to a business. Fill in these details once; you can edit them later.
          </AlertDescription>
        </Alert>
      ) : null}
      <BusinessForm setup={setup} />
    </div>
  );
}
