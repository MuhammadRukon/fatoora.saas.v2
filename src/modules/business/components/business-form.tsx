'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertCircle } from '@tabler/icons-react';

import { Loader } from '@/components/common/loader';
import { FormSection, SelectField, TextField } from '@/components/form-fields';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import {
  SELLER_ID_SCHEME_LABELS,
  ZATCA_ENVIRONMENT_LABELS,
  businessUpsertSchema,
  type BusinessDTO,
  type BusinessUpsertData,
  type BusinessUpsertInput,
} from '@/contracts/business';
import { useBusiness, useSaveBusiness } from '@/modules/business/hooks';

const EMPTY: Required<{ [K in keyof BusinessUpsertInput]: string }> = {
  nameEn: '',
  nameAr: '',
  vatNumber: '',
  sellerIdScheme: 'CRN',
  sellerIdValue: '',
  street: '',
  streetAr: '',
  buildingNumber: '',
  additionalNumber: '',
  district: '',
  districtAr: '',
  city: '',
  cityAr: '',
  postalCode: '',
  countryCode: 'SA',
  businessCategory: '',
  zatcaEnvironment: 'SIMULATION',
};

/** Saved profile → form values (nulls become empty inputs). */
const toForm = (b: BusinessDTO) =>
  Object.fromEntries(
    Object.keys(EMPTY).map((k) => [k, b[k as keyof BusinessDTO] ?? '']),
  ) as BusinessUpsertInput;

const digits = { inputMode: 'numeric', autoComplete: 'off', className: 'tabular-nums' } as const;
const arabic = { dir: 'rtl', lang: 'ar' } as const;

export function BusinessForm({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const { data: business, isLoading, isError } = useBusiness();
  const save = useSaveBusiness();

  const form = useForm<BusinessUpsertInput, unknown, BusinessUpsertData>({
    resolver: zodResolver(businessUpsertSchema),
    defaultValues: EMPTY as BusinessUpsertInput,
  });
  const { control } = form;

  useEffect(() => {
    if (business) form.reset(toForm(business));
  }, [business, form]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading business profile">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <Alert variant="destructive">
        <IconAlertCircle />
        <AlertTitle>Couldn&apos;t load your business profile</AlertTitle>
        <AlertDescription>Refresh the page to try again.</AlertDescription>
      </Alert>
    );
  }

  const onSubmit = (values: BusinessUpsertData) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        form.reset(toForm(saved));
        if (setup) router.push('/app');
      },
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col">
        <div className="divide-y">
          <FormSection
            title="Legal name"
            description="As registered with ZATCA. Invoices print both names; the Arabic one is required."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField control={control} name="nameEn" label="Name in English" autoComplete="organization" />
              <TextField
                control={control}
                name="nameAr"
                label="Name in Arabic"
                placeholder="اسم المنشأة"
                {...arabic}
              />
            </div>
          </FormSection>

          <FormSection
            title="Tax registration"
            description="Your VAT number and one other registration that identifies the business."
          >
            <TextField
              control={control}
              name="vatNumber"
              label="VAT registration number"
              hint="15 digits, starting and ending with 3."
              maxLength={15}
              placeholder="3xxxxxxxxxxxxx3"
              {...digits}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                control={control}
                name="sellerIdScheme"
                label="Other ID type"
                options={SELLER_ID_SCHEME_LABELS}
              />
              <TextField
                control={control}
                name="sellerIdValue"
                label="Other ID number"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
            <TextField
              control={control}
              name="businessCategory"
              label="Business category"
              hint="Your line of business, e.g. Retail or IT services. Sent to ZATCA during onboarding."
            />
          </FormSection>

          <FormSection
            title="National address"
            description="The Saudi national address of the business. Arabic lines are optional."
          >
            {(
              [
                ['street', 'streetAr', 'Street', 'اسم الشارع'],
                ['district', 'districtAr', 'District', 'الحي'],
                ['city', 'cityAr', 'City', 'المدينة'],
              ] as const
            ).map(([en, ar, label, arPlaceholder]) => (
              <div key={en} className="grid gap-5 sm:grid-cols-2">
                <TextField control={control} name={en} label={label} />
                <TextField
                  control={control}
                  name={ar}
                  label={`${label} in Arabic`}
                  placeholder={arPlaceholder}
                  {...arabic}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <TextField control={control} name="buildingNumber" label="Building no." maxLength={4} {...digits} />
              <TextField
                control={control}
                name="additionalNumber"
                label="Additional no."
                maxLength={4}
                {...digits}
              />
              <TextField
                control={control}
                name="postalCode"
                label="Postal code"
                maxLength={5}
                {...digits}
                autoComplete="postal-code"
              />
              <TextField
                control={control}
                name="countryCode"
                label="Country"
                maxLength={2}
                autoComplete="country"
                className="uppercase"
              />
            </div>
          </FormSection>

          <FormSection
            title="ZATCA environment"
            description="Start in Simulation to test end to end. Switch to Production when you're ready to issue real invoices; it locks once a device is onboarded."
          >
            <SelectField
              control={control}
              name="zatcaEnvironment"
              label="Environment"
              options={ZATCA_ENVIRONMENT_LABELS}
            />
          </FormSection>
        </div>

        <div className="flex items-center justify-end gap-3 border-t pt-6">
          {form.formState.isDirty && !save.isPending ? (
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
          ) : null}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader /> : business ? 'Save changes' : 'Create business profile'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
