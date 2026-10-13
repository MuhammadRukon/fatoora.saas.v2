'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import type { Address } from '@prisma/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';

import { useAddresses, useAddressMutations } from '@/modules/account/hooks';
import { AddressForm } from '@/modules/account/components/address-form';

export default function AddressesPage() {
  const router = useRouter();
  const { status } = useSession();
  const addresses = useAddresses();
  const { remove } = useAddressMutations();

  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=/account/addresses');
    }
  }, [status, router]);

  if (status !== 'authenticated' || addresses.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }

  const items = addresses.data ?? [];

  return (
    <div className="space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Saved addresses</h1>
        {!creating && !editing ? (
          <Button onClick={() => setCreating(true)}>Add address</Button>
        ) : null}
      </div>

      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>New address</CardTitle>
          </CardHeader>
          <CardContent>
            <AddressForm
              onSaved={() => setCreating(false)}
              onCancel={() => setCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit address</CardTitle>
          </CardHeader>
          <CardContent>
            <AddressForm
              initial={editing}
              onSaved={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          </CardContent>
        </Card>
      ) : null}

      {items.length === 0 && !creating ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            You haven&apos;t saved any addresses yet.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((addr) => (
          <Card key={addr.id}>
            <CardContent className="space-y-3 p-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{addr.recipientName}</span>
                  {addr.isDefault ? (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      Default
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{addr.recipientPhone}</p>
                <p className="text-sm text-muted-foreground">
                  {[addr.line1, addr.line2, addr.city, addr.district, addr.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(addr)}
                  disabled={!!editing}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => remove.mutate(addr.id)}
                  disabled={remove.isPending}
                >
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
