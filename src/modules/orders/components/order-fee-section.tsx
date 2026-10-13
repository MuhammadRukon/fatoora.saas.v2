'use client';

import { CheckCircle2Icon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CustomerPayment } from '@/contracts/payments';
import { buildCodFeeWarning, buildFeeRejectedMessage } from '@/lib/cod-fee/copy';
import type { FeeNoticeState } from '@/lib/cod-fee/view';
import { AddTxnIdCard } from '@/modules/checkout/components/add-txn-id-card';
import { CodFeeNotice } from '@/modules/checkout/components/cod-fee-notice';
import { PaymentConfigError } from '@/modules/checkout/components/payment-config-error';
import type { usePaymentConfig } from '@/modules/checkout/hooks';

type PaymentConfigQuery = ReturnType<typeof usePaymentConfig>;

/** Read-only display of the submitted id. Never an input: it is add-only. */
function SubmittedTxnId({ payment }: { payment: CustomerPayment }) {
  if (!payment.customerTxnId) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction ID</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p className="break-all font-mono">{payment.customerTxnId}</p>
        {payment.txnSubmittedAt ? (
          <p className="text-xs text-muted-foreground">
            Submitted {new Date(payment.txnSubmittedAt).toLocaleString()}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * COD confirmation-fee state. The warning is built from the Payment snapshot
 * (feeType/feeValue/feeCents), so it stays correct if the admin later changes
 * or disables the fee; only contact, QR and note come from live config.
 */
export function FeeSection({
  state,
  payment,
  config,
}: {
  state: Exclude<FeeNoticeState, 'none'>;
  payment: CustomerPayment;
  config: PaymentConfigQuery;
}) {
  const contact = config.data?.contactNumber ?? null;

  if (state === 'verified') {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle className="line-clamp-none">Confirmation fee verified</AlertTitle>
      </Alert>
    );
  }

  if (state === 'rejected') {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription className="text-destructive">
            {buildFeeRejectedMessage(contact)}
          </AlertDescription>
        </Alert>
        <SubmittedTxnId payment={payment} />
      </div>
    );
  }

  if (config.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading payment details...</p>;
  }

  if (config.isError || !config.data) {
    return (
      <PaymentConfigError
        message="We could not load the payment details for your confirmation fee."
        query={config}
      />
    );
  }

  return (
    <div className="space-y-4">
      <CodFeeNotice
        warning={buildCodFeeWarning({
          type: payment.feeType ?? 'FLAT',
          value: payment.feeValue ?? payment.feeCents,
          feeCents: payment.feeCents,
          contactNumber: contact,
        })}
        qrImageUrl={config.data.qrImageUrl}
        contactNumber={contact}
        paymentNote={config.data.paymentNote}
      />
      {payment.customerTxnId ? (
        <SubmittedTxnId payment={payment} />
      ) : (
        <AddTxnIdCard paymentId={payment.id} contactNumber={contact} />
      )}
    </div>
  );
}
