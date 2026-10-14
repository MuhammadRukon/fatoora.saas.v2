'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Loader } from '@/components/common/loader';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormSection, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ID_SCHEME_LABELS } from '@/contracts/common';
import {
  customerInputSchema,
  type CustomerData,
  type CustomerDTO,
  type CustomerInput,
} from '@/contracts/customers';
import { useDeleteCustomer, useSaveCustomer } from '@/modules/customers/hooks';

const EMPTY: Required<{ [K in keyof CustomerInput]: string }> = {
  name: '',
  nameAr: '',
  vatNumber: '',
  buyerIdScheme: '',
  buyerIdValue: '',
  street: '',
  buildingNumber: '',
  additionalNumber: '',
  district: '',
  city: '',
  postalCode: '',
  countryCode: 'SA',
  email: '',
  phone: '',
};

const toForm = (c: CustomerDTO) =>
  Object.fromEntries(
    Object.keys(EMPTY).map((k) => [k, c[k as keyof CustomerDTO] ?? '']),
  ) as CustomerInput;

const digits = { inputMode: 'numeric', autoComplete: 'off', className: 'tabular-nums' } as const;

/** New customer when `customer` is undefined, otherwise edit (with delete). */
export function CustomerForm({ customer }: { customer?: CustomerDTO }) {
  const router = useRouter();
  const save = useSaveCustomer(customer?.id);
  const form = useForm<CustomerInput, unknown, CustomerData>({
    resolver: zodResolver(customerInputSchema),
    defaultValues: customer ? toForm(customer) : (EMPTY as CustomerInput),
  });
  const { control } = form;

  const onSubmit = (values: CustomerData) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        if (customer) form.reset(toForm(saved));
        else router.push(`/app/customers/${saved.id}`);
      },
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col">
        <div className="divide-y">
          <FormSection title="Customer" description="The name printed on invoices. The Arabic name is optional.">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField control={control} name="name" label="Name" autoComplete="off" />
              <TextField
                control={control}
                name="nameAr"
                label="Name in Arabic"
                placeholder="اسم العميل"
                dir="rtl"
                lang="ar"
              />
            </div>
          </FormSection>

          <FormSection
            title="Tax identity"
            description={
              <>
                <p>VAT-registered buyers: the VAT number only.</p>
                <p className="mt-1.5">Everyone else: an ID type and number, if you have one.</p>
              </>
            }
          >
            <TextField
              control={control}
              name="vatNumber"
              label="VAT registration number"
              hint="15 digits, starting and ending with 3."
              maxLength={15}
              {...digits}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                control={control}
                name="buyerIdScheme"
                label="ID type"
                options={ID_SCHEME_LABELS}
                noneLabel="No ID"
                placeholder="No ID"
              />
              <TextField
                control={control}
                name="buyerIdValue"
                label="ID number"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </FormSection>

          <FormSection
            title="Address"
            description="Standard (B2B) tax invoices to Saudi buyers need the full address: street, building number, district, city and postal code."
          >
            <TextField control={control} name="street" label="Street" autoComplete="off" />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField control={control} name="district" label="District" autoComplete="off" />
              <TextField control={control} name="city" label="City" autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              <TextField control={control} name="buildingNumber" label="Building no." maxLength={4} {...digits} />
              <TextField
                control={control}
                name="additionalNumber"
                label="Additional no."
                maxLength={4}
                {...digits}
              />
              <TextField control={control} name="postalCode" label="Postal code" maxLength={5} {...digits} />
              <TextField
                control={control}
                name="countryCode"
                label="Country"
                maxLength={2}
                autoComplete="off"
                className="uppercase"
              />
            </div>
          </FormSection>

          <FormSection title="Contact" description="Optional.">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField control={control} name="email" label="Email" type="email" autoComplete="off" />
              <TextField control={control} name="phone" label="Phone" type="tel" autoComplete="off" />
            </div>
          </FormSection>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-6">
          {customer ? <DeleteCustomerButton customer={customer} /> : null}
          <div className="ml-auto flex items-center gap-3">
            {form.formState.isDirty && !save.isPending ? (
              <span className="text-sm text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/app/customers">{customer ? 'Back' : 'Cancel'}</Link>
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader /> : customer ? 'Save changes' : 'Add customer'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

function DeleteCustomerButton({ customer }: { customer: CustomerDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useDeleteCustomer(customer.id);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={remove.isPending}
        onClick={() => setOpen(true)}
      >
        {remove.isPending ? <Loader /> : 'Delete customer'}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${customer.name}?`}
        description="This removes the customer from your list. Customers used on invoices can't be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => router.push('/app/customers') })}
      />
    </>
  );
}
