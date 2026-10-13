'use client';

import { useWatch, type UseFormReturn } from 'react-hook-form';
import { CodFeeType, PaymentMethod } from '@prisma/client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  isValidCodFeeValue,
  PAYMENT_NOTE_MAX,
  type PaymentSettingsInput,
} from '@/contracts/payment-settings';
import {
  AdminImageUploader,
  type UploadedImage,
} from '@/modules/admin/catalog/components/admin-image-uploader';
import { FeePreview } from '@/modules/admin/settings/components/fee-preview';
import { FeeValueInput } from '@/modules/admin/settings/components/fee-value-input';
import { defaultFeeValue, emptyToNull } from '@/modules/admin/settings/payment-settings-values';

export function CodFeeCard({ form }: { form: UseFormReturn<PaymentSettingsInput> }) {
  const [enabledMethods, codFeeType, qrImageUrl, qrImagePublicId] = useWatch({
    control: form.control,
    name: ['enabledMethods', 'codFeeType', 'qrImageUrl', 'qrImagePublicId'],
  });

  const qrValue: UploadedImage[] =
    qrImageUrl && qrImagePublicId
      ? [{ url: qrImageUrl, publicId: qrImagePublicId, alt: 'Payment QR code' }]
      : [];

  const codOn = !!enabledMethods?.includes(PaymentMethod.COD);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash on Delivery confirmation fee</CardTitle>
        <CardDescription>
          When on, COD orders stay pending until you verify an advance fee that the customer pays
          outside the site. The fee is credited against the order total.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="codFeeEnabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between gap-4 space-y-0 rounded-lg border p-3">
              <div className="space-y-1">
                <FormLabel>Require a confirmation fee</FormLabel>
                <FormDescription>
                  {codOn
                    ? 'New COD orders wait for your verification.'
                    : 'Enable Cash on Delivery first.'}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={!!field.value && codOn}
                  disabled={!codOn}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <FormField
            control={form.control}
            name="codFeeType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fee type</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(next) => {
                    const type = next as CodFeeType;
                    field.onChange(type);
                    if (!isValidCodFeeValue(type, form.getValues('codFeeValue'))) {
                      form.setValue('codFeeValue', defaultFeeValue(type), {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={CodFeeType.FLAT}>Flat amount (BDT)</SelectItem>
                    <SelectItem value={CodFeeType.PERCENT}>Percentage of total</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="codFeeValue"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{codFeeType === CodFeeType.PERCENT ? 'Fee (%)' : 'Fee (BDT)'}</FormLabel>
                <FormControl>
                  <FeeValueInput
                    type={codFeeType ?? CodFeeType.FLAT}
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>
                  {codFeeType === CodFeeType.PERCENT
                    ? 'Whole number 1-100. Rounded up to the next Tk 10 and capped at the order total.'
                    : 'Whole BDT, at least 1. Capped at the order total.'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FeePreview control={form.control} />

        <FormField
          control={form.control}
          name="contactNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact number</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  placeholder="01XXXXXXXXX"
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  onChange={(e) => field.onChange(emptyToNull(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                Shown to customers so they know where to pay or whom to contact. Required when the
                fee is on.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="paymentNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment note</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  maxLength={PAYMENT_NOTE_MAX}
                  placeholder="e.g. Send the fee via bKash personal, then add the transaction ID."
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  onChange={(e) => field.onChange(emptyToNull(e.target.value))}
                />
              </FormControl>
              <FormDescription>
                {(field.value ?? '').length}/{PAYMENT_NOTE_MAX}. Shown as plain text.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="qrImageUrl"
          render={() => (
            <FormItem>
              <AdminImageUploader
                label="Payment QR code"
                single
                folder="settings"
                deferDelete
                value={qrValue}
                onChange={(next) => {
                  const img = next[0];
                  form.setValue('qrImageUrl', img?.url ?? null, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                  form.setValue('qrImagePublicId', img?.publicId ?? null, {
                    shouldDirty: true,
                  });
                }}
              />
              <FormDescription>
                The previous QR is removed from storage when you save.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
