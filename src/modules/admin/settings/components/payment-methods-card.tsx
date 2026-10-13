'use client';

import type { UseFormReturn } from 'react-hook-form';
import { PaymentMethod } from '@prisma/client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { canonicalMethods, type PaymentSettingsInput } from '@/contracts/payment-settings';
import type { AdminPaymentSettingsResponse } from '@/modules/admin/settings/hooks';

const METHOD_COPY: Record<PaymentMethod, { label: string; hint: string }> = {
  [PaymentMethod.COD]: {
    label: 'Cash on Delivery',
    hint: 'Customers pay in cash when the order arrives.',
  },
  [PaymentMethod.BANK_TRANSFER]: {
    label: 'Bank transfer',
    hint: 'Customers transfer manually and submit a reference; you verify it.',
  },
  [PaymentMethod.BKASH]: {
    label: 'bKash',
    hint: 'Online payment through the bKash gateway.',
  },
  [PaymentMethod.SSLCOMMERZ]: {
    label: 'SSLCommerz',
    hint: 'Cards and mobile banking through the SSLCommerz hosted checkout.',
  },
};

/** Display order of the method switches. */
const METHODS = [
  PaymentMethod.COD,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.BKASH,
  PaymentMethod.SSLCOMMERZ,
].map((method) => ({ method, ...METHOD_COPY[method] }));

type GatewayConfigured = AdminPaymentSettingsResponse['gatewayConfigured'];

/** Whether at least one enabled method is also usable on this host. */
export function hasUsableMethod(
  enabledMethods: readonly PaymentMethod[] | undefined,
  gatewayConfigured: GatewayConfigured,
): boolean {
  return METHODS.some((m) => enabledMethods?.includes(m.method) && gatewayConfigured[m.method]);
}

interface PaymentMethodsCardProps {
  form: UseFormReturn<PaymentSettingsInput>;
  gatewayConfigured: GatewayConfigured;
  /** `hasUsableMethod` for the current form values (the shell also needs it). */
  anyMethodOn: boolean;
}

export function PaymentMethodsCard({
  form,
  gatewayConfigured,
  anyMethodOn,
}: PaymentMethodsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>
          Choose which methods customers can use at checkout. Gateways need credentials configured
          on the server before they can be turned on.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {METHODS.map(({ method, label, hint }) => {
          const configured = gatewayConfigured[method];
          return (
            <FormField
              key={method}
              control={form.control}
              name="enabledMethods"
              render={({ field: f }) => {
                const on = f.value.includes(method);
                return (
                  <FormItem className="flex items-center justify-between gap-4 space-y-0 rounded-lg border p-3">
                    <div className="space-y-1">
                      <FormLabel className="flex flex-wrap items-center gap-2">
                        {label}
                        {!configured ? (
                          <Badge variant="outline" className="text-amber-700 dark:text-amber-300">
                            credentials missing
                          </Badge>
                        ) : null}
                      </FormLabel>
                      <FormDescription>{hint}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={on}
                        // A gateway without credentials can be switched off but never on.
                        disabled={!configured && !on}
                        onCheckedChange={(next) => {
                          const others = f.value.filter((m) => m !== method);
                          f.onChange(canonicalMethods(next ? [...others, method] : others));
                          if (method === PaymentMethod.COD && !next) {
                            form.setValue('codFeeEnabled', false, { shouldDirty: true });
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                );
              }}
            />
          );
        })}
        {!anyMethodOn ? (
          <Alert variant="destructive">
            <AlertTitle>No payment method enabled</AlertTitle>
            <AlertDescription>
              Turn on at least one available method, otherwise customers cannot check out.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
