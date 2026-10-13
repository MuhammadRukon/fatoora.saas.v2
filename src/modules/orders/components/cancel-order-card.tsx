'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useCancelOrder } from '@/modules/orders/hooks';

/** Customer cancellation form. The page decides when to render it (cancellable statuses). */
export function CancelOrderCard({ orderId }: { orderId: string }) {
  const cancel = useCancelOrder(orderId);
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancel order</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tell us why you'd like to cancel"
        />
        <Button
          variant="destructive"
          disabled={reason.trim().length < 2 || cancel.isPending}
          onClick={() => cancel.mutate(reason.trim())}
        >
          {cancel.isPending ? 'Cancelling...' : 'Cancel order'}
        </Button>
      </CardContent>
    </Card>
  );
}
