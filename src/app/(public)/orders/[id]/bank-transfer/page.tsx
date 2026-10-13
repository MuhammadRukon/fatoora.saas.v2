'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader } from '@/app/common/loader/loader';
import { ApiClientError, apiFetch } from '@/lib/fetcher';
import { formatBDT } from '@/server/common/money';
import { useOrderDetail } from '@/modules/orders/hooks';

const BANK_DETAILS = {
  bank: 'Brac Bank Limited',
  branch: 'Gulshan Branch',
  accountName: 'Gadget Cryptech Ltd.',
  accountNumber: '1501-201-XXXX-001',
  routing: '060272836',
};

export default function BankTransferPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { status } = useSession();
  const order = useOrderDetail(id);

  const [bankRef, setBankRef] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/login?callbackUrl=/orders/${id ?? ''}/bank-transfer`);
    }
  }, [status, router, id]);

  if (status !== 'authenticated' || order.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }
  if (order.error || !order.data) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          We couldn&apos;t load this order.{' '}
          <Link href="/account/orders" className="underline">
            View all orders
          </Link>
          .
        </CardContent>
      </Card>
    );
  }

  const o = order.data;
  const pendingBank = o.payments.find(
    (p) => p.method === 'BANK_TRANSFER' && p.status === 'PENDING',
  );

  if (!pendingBank) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p>No pending bank transfer is attached to this order.</p>
          <Link href={`/orders/${o.id}`} className="underline">
            Back to order
          </Link>
        </CardContent>
      </Card>
    );
  }

  async function submit() {
    if (!pendingBank) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/payments/bank', {
        method: 'POST',
        body: { paymentId: pendingBank.id, bankRef: bankRef.trim() },
      });
      toast.success('Bank reference submitted. We will verify shortly.');
      router.push(`/orders/${o.id}`);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not submit reference';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Bank transfer</h1>
        <p className="text-sm text-muted-foreground">
          Order {o.orderNumber} · Total {formatBDT(o.totalCents)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Send the payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Please transfer the order total to the following account:</p>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1 mt-3">
            <dt className="text-muted-foreground">Bank</dt>
            <dd>{BANK_DETAILS.bank}</dd>
            <dt className="text-muted-foreground">Branch</dt>
            <dd>{BANK_DETAILS.branch}</dd>
            <dt className="text-muted-foreground">Account name</dt>
            <dd>{BANK_DETAILS.accountName}</dd>
            <dt className="text-muted-foreground">Account number</dt>
            <dd>{BANK_DETAILS.accountNumber}</dd>
            <dt className="text-muted-foreground">Routing</dt>
            <dd>{BANK_DETAILS.routing}</dd>
            <dt className="text-muted-foreground">Reference</dt>
            <dd className="font-mono">{o.orderNumber}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Submit your transaction reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Once you&apos;ve sent the transfer, paste the bank&apos;s transaction reference here.
            Our team will verify it and confirm your order, usually within one business day.
          </p>
          <Input
            placeholder="e.g. TRX-20251231-0042"
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
          />
          <Button onClick={submit} disabled={bankRef.trim().length < 3 || submitting}>
            {submitting ? 'Submitting...' : 'Submit reference'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
