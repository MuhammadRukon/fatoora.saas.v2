'use client';

import type { ComponentProps } from 'react';
import type { PaymentMethod } from '@prisma/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildCodFeeWarning } from '@/lib/cod-fee/copy';
import type { CheckoutQuote } from '@/contracts/checkout';
import type { usePaymentConfig } from '@/modules/checkout/hooks';
import { PAYMENT_METHOD_INFO } from '@/modules/checkout/payment-methods';
import { CodFeeNotice } from '@/modules/checkout/components/cod-fee-notice';
import { PaymentConfigError } from '@/modules/checkout/components/payment-config-error';
import { TxnIdField } from '@/modules/checkout/components/txn-id-field';

interface CheckoutPaymentCardProps {
  /**
   * The checkout's single `usePaymentConfig()` result. Passed in (not called
   * here) so this card mounting later never triggers another config request.
   */
  config: ReturnType<typeof usePaymentConfig>;
  /** The effective selection; null when the customer still has to choose. */
  paymentMethod: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  /** Fee UI only shows for a settled COD quote with a fee. */
  feeActive: boolean;
  quote: CheckoutQuote | null;
  txnFieldProps: ComponentProps<typeof TxnIdField>;
}

export function CheckoutPaymentCard({
  config,
  paymentMethod,
  onSelect,
  feeActive,
  quote,
  txnFieldProps,
}: CheckoutPaymentCardProps) {
  const feeRule = quote?.codFeeRule ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment method</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {config.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading payment methods...</p>
        ) : config.isError || !config.data ? (
          <PaymentConfigError message="We could not load the payment methods." query={config} />
        ) : config.data.methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment methods are available right now. Please try again later.
          </p>
        ) : (
          config.data.methods.map((method) => {
            const info = PAYMENT_METHOD_INFO[method];
            return (
              <label
                key={method}
                className={`flex cursor-pointer items-center gap-3 rounded border p-3 ${
                  paymentMethod === method ? 'border-primary' : ''
                }`}
              >
                <input
                  type="radio"
                  name="payment"
                  checked={paymentMethod === method}
                  onChange={() => onSelect(method)}
                />
                <span className="flex-1 text-sm">{info.label}</span>
              </label>
            );
          })
        )}
        {config.data && config.data.methods.length > 0 && !paymentMethod ? (
          <p className="text-sm text-destructive">Choose a payment method to continue.</p>
        ) : null}
        {feeActive && config.data && feeRule && quote ? (
          <div className="space-y-4 pt-2">
            <CodFeeNotice
              warning={buildCodFeeWarning({
                type: feeRule.type,
                value: feeRule.value,
                feeCents: quote.codFeeCents,
                contactNumber: config.data.contactNumber,
              })}
              qrImageUrl={config.data.qrImageUrl}
              contactNumber={config.data.contactNumber}
              paymentNote={config.data.paymentNote}
            />
            <TxnIdField {...txnFieldProps} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
