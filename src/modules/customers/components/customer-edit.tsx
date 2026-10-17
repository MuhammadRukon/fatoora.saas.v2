'use client';

import Link from 'next/link';
import { IconAlertCircle } from '@tabler/icons-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/fetcher';
import { useCustomer } from '@/modules/customers/hooks';

import { CustomerForm } from './customer-form';

export function CustomerEdit({ id }: { id: string }) {
  const { data: customer, isLoading, error } = useCustomer(id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/app/customers" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Customers
        </Link>
        {isLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <h1 className="text-2xl font-semibold tracking-tight">{customer?.name ?? 'Customer'}</h1>
        )}
      </div>
      {error ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertTitle>
            {error instanceof ApiClientError && error.status === 404
              ? 'Customer not found'
              : "Couldn't load this customer"}
          </AlertTitle>
          <AlertDescription>
            <p>
              It may have been deleted.{' '}
              <Link href="/app/customers" className="font-medium underline underline-offset-4">
                Back to customers
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : customer ? (
        // key: remount (fresh defaults) when switching between customers
        <CustomerForm key={customer.id} customer={customer} />
      ) : (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading customer">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}
