'use client';

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';

import {
  paymentSettingsInputSchema,
  type PaymentSettingsInput,
} from '@/contracts/payment-settings';
import { CodFeeCard } from '@/modules/admin/settings/components/cod-fee-card';
import {
  PaymentMethodsCard,
  hasUsableMethod,
} from '@/modules/admin/settings/components/payment-methods-card';
import { blankToNull, toFormValues } from '@/modules/admin/settings/payment-settings-values';
import {
  useUpdatePaymentSettings,
  type AdminPaymentSettingsResponse,
} from '@/modules/admin/settings/hooks';

interface PaymentSettingsFormProps {
  data: AdminPaymentSettingsResponse;
}

export function PaymentSettingsForm({ data }: PaymentSettingsFormProps) {
  const update = useUpdatePaymentSettings();
  const { gatewayConfigured } = data;

  const form = useForm<PaymentSettingsInput>({
    resolver: zodResolver(paymentSettingsInputSchema),
    defaultValues: toFormValues(data.settings),
  });

  const enabledMethods = useWatch({ control: form.control, name: 'enabledMethods' });
  const anyMethodOn = hasUsableMethod(enabledMethods, gatewayConfigured);

  async function onSubmit(input: PaymentSettingsInput) {
    try {
      const res = await update.mutateAsync({
        ...input,
        contactNumber: blankToNull(input.contactNumber?.trim()),
        paymentNote: blankToNull(input.paymentNote),
        qrImageUrl: input.qrImageUrl ?? null,
        qrImagePublicId: input.qrImagePublicId ?? null,
      });
      form.reset(toFormValues(res.settings));
    } catch {
      // Toast handled inside the mutation.
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <PaymentMethodsCard
          form={form}
          gatewayConfigured={gatewayConfigured}
          anyMethodOn={anyMethodOn}
        />

        <CodFeeCard form={form} />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!form.formState.isDirty || update.isPending}
            onClick={() => form.reset(toFormValues(data.settings))}
          >
            Discard changes
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isDirty || update.isPending || !anyMethodOn}
          >
            {update.isPending ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
