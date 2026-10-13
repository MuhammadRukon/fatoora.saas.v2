'use client';

import { useId, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ApiClientError } from '@/lib/fetcher';
import { isTxnIdDuplicate } from '@/modules/checkout/checkout-error';
import { TxnIdInput } from '@/modules/checkout/components/txn-id-input';
import {
  TXN_ID_FORMAT_HINT,
  buildTxnConfirmText,
  buildTxnDuplicateOnOrderMessage,
  parseTxnIdInput,
} from '@/modules/checkout/txn-id';
import { useSubmitTxnId } from '@/modules/orders/hooks';

interface AddTxnIdCardProps {
  paymentId: string;
  contactNumber: string | null;
}

/**
 * Add-only transaction id form for a fee-pending COD order. The id cannot be
 * edited after submission, so a confirm dialog sits in front of the request.
 * A duplicate id shows a message only: no link, no order details.
 */
export function AddTxnIdCard({ paymentId, contactNumber }: AddTxnIdCardProps) {
  const inputId = useId();
  const submit = useSubmitTxnId();
  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseTxnIdInput(value);
  const showFormatHint = value.trim() !== '' && parsed.status === 'invalid';

  function send() {
    if (parsed.status !== 'valid') return;
    setError(null);
    submit.mutate(
      { paymentId, txnId: parsed.value },
      {
        onError: (err) => {
          if (isTxnIdDuplicate(err)) {
            setError(buildTxnDuplicateOnOrderMessage(contactNumber));
            return;
          }
          setError(
            err instanceof ApiClientError ? err.message : 'Could not submit the transaction ID',
          );
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction ID</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Paid the confirmation fee? Add your transaction ID so we can verify it faster. You can add
          it once.
        </p>
        <div className="space-y-2">
          <Label htmlFor={inputId}>Transaction ID</Label>
          <TxnIdInput
            id={inputId}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            aria-invalid={showFormatHint || !!error}
          />
          {showFormatHint ? (
            <p className="text-xs text-destructive">{TXN_ID_FORMAT_HINT}</p>
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription className="text-destructive">{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button
          type="button"
          disabled={parsed.status !== 'valid' || submit.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {submit.isPending ? 'Submitting...' : 'Add transaction ID'}
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit transaction ID?"
        description={buildTxnConfirmText(contactNumber)}
        confirmLabel="Submit"
        onConfirm={send}
      />
    </Card>
  );
}
