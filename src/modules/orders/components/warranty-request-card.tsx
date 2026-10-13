'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useSubmitWarranty } from '@/modules/warranty/hooks';

/** Customer warranty request form. The page decides when to render it (DELIVERED orders). */
export function WarrantyRequestCard({ orderId }: { orderId: string }) {
  const warranty = useSubmitWarranty(orderId);
  const [warrantyReason, setWarrantyReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request warranty service</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Describe the issue with your order. Our team will review and respond, usually
          within two business days.
        </p>
        <Textarea
          rows={4}
          value={warrantyReason}
          onChange={(e) => setWarrantyReason(e.target.value)}
          placeholder="Describe the defect, when it started, and any troubleshooting you've tried."
        />
        <Button
          disabled={warrantyReason.trim().length < 20 || warranty.isPending}
          onClick={async () => {
            await warranty.mutateAsync(warrantyReason.trim());
            setWarrantyReason('');
          }}
        >
          {warranty.isPending ? 'Submitting...' : 'Submit warranty request'}
        </Button>
      </CardContent>
    </Card>
  );
}
