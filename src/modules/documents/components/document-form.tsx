'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm, useWatch, type Control, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { DocumentKind } from '@prisma/client';

import { Loader } from '@/components/common/loader';
import { FormSection, SelectField, TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_SUBTYPE_LABELS,
  EXEMPTION_REASONS,
  PAYMENT_MEANS_LABELS,
  TAX_CATEGORY_LABELS,
  documentDraftSchema,
  type DocumentDTO,
  type DocumentDraftData,
  type DocumentDraftInput,
  type DocumentLineInput,
} from '@/contracts/documents';
import { apiFetch } from '@/lib/fetcher';
import { useCustomers } from '@/modules/customers/hooks';
import { computeDocument, STANDARD_RATE_BP } from '@/server/documents/vat-engine';
import { VATEX_REASONS } from '@/server/zatca/codes';

import { formatAmount } from '../format';
import { useDocuments, useSaveDocument } from '../hooks';
import { MoneyField } from './money-field';
import { Picker } from './picker';

const EMPTY_LINE: DocumentLineInput = {
  description: '',
  descriptionAr: '',
  quantity: '1',
  unitCode: 'PCE',
  unitPriceHalalas: 0,
  lineDiscountHalalas: 0,
  taxCategory: 'S',
  exemptionReasonCode: '',
  exemptionReason: '',
};

const emptyDraft = (kind: DocumentKind): DocumentDraftInput => ({
  kind,
  subtype: 'SIMPLIFIED',
  customerId: '',
  supplyDate: '',
  supplyEndDate: '',
  paymentMeansCode: '',
  docDiscountHalalas: 0,
  docDiscountReason: '',
  lines: [EMPTY_LINE],
  billingReferenceId: '',
  noteReason: '',
  notes: '',
});

/** The stored draft as form values (amounts stay halalas, empty optionals become ''). */
export const draftToForm = (d: DocumentDTO): DocumentDraftInput => ({
  kind: d.kind,
  subtype: d.subtype,
  customerId: d.customerId ?? '',
  supplyDate: d.supplyDate ?? '',
  supplyEndDate: d.supplyEndDate ?? '',
  paymentMeansCode: d.paymentMeansCode ?? '',
  docDiscountHalalas: d.docDiscountHalalas,
  docDiscountReason: d.docDiscountReason ?? '',
  lines: d.lines.map((l) => ({
    description: l.description,
    descriptionAr: l.descriptionAr ?? '',
    quantity: l.quantity,
    unitCode: l.unitCode,
    unitPriceHalalas: l.unitPriceHalalas,
    lineDiscountHalalas: l.lineDiscountHalalas,
    taxCategory: l.taxCategory,
    taxRateBp: l.taxRateBp,
    exemptionReasonCode: l.exemptionReasonCode ?? '',
    exemptionReason: l.exemptionReason ?? '',
  })),
  billingReferenceId: d.billingReference?.id ?? '',
  noteReason: d.noteReason ?? '',
  notes: d.notes ?? '',
});

/** Live totals from the same pure engine the server uses; the server result is what gets stored. */
function usePreview(control: Control<DocumentDraftInput, unknown, DocumentDraftData>) {
  const [lines, docDiscount] = useWatch({ control, name: ['lines', 'docDiscountHalalas'] });
  return useMemo(() => {
    try {
      const result = computeDocument({
        lines: (lines ?? []).map((l) => ({
          quantity: String(l.quantity ?? ''),
          unitPriceHalalas: Number(l.unitPriceHalalas),
          lineDiscountHalalas: Number(l.lineDiscountHalalas ?? 0),
          taxCategory: l.taxCategory,
          taxRateBp: l.taxCategory === 'S' ? STANDARD_RATE_BP : 0,
          exemptionReasonCode: l.exemptionReasonCode,
          exemptionReason: l.exemptionReason,
        })),
        docDiscountHalalas: Number(docDiscount ?? 0),
      });
      return { result, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/ \([A-Z_]+\)$/, '') : 'Could not calculate';
      return { result: null, error: message };
    }
  }, [lines, docDiscount]);
}

/** New draft when `draft` is undefined, otherwise edits that DRAFT. */
export function DocumentForm({ kind, draft }: { kind: DocumentKind; draft?: DocumentDTO }) {
  const router = useRouter();
  const save = useSaveDocument(draft?.id);
  const form = useForm<DocumentDraftInput, unknown, DocumentDraftData>({
    resolver: zodResolver(documentDraftSchema),
    defaultValues: draft ? draftToForm(draft) : emptyDraft(kind),
  });
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const preview = usePreview(control);
  const subtype = useWatch({ control, name: 'subtype' });
  const isNote = kind !== 'INVOICE';
  const hasDiscount = (useWatch({ control, name: 'docDiscountHalalas' }) ?? 0) > 0;

  const onSubmit = (values: DocumentDraftData) =>
    save.mutate(values, {
      onSuccess: (saved) => {
        if (draft) form.reset(draftToForm(saved));
        else router.push(`/app/invoices/${saved.id}`);
      },
    });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col">
        <div className="divide-y">
          <FormSection
            title={DOCUMENT_KIND_LABELS[kind]}
            description={
              isNote
                ? 'A note corrects an issued invoice and takes its type and customer.'
                : 'Standard invoices (B2B) go to a business customer and are cleared by ZATCA. Simplified invoices (B2C) are reported.'
            }
          >
            {isNote ? <OriginalPicker form={form} initial={draft} /> : null}
            <FormField
              control={control}
              name="subtype"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Invoice type</FormLabel>
                  <FormControl>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      value={field.value}
                      disabled={isNote}
                      onValueChange={(v) => v && field.onChange(v)}
                      className="w-fit"
                    >
                      {Object.entries(DOCUMENT_SUBTYPE_LABELS).map(([value, text]) => (
                        <ToggleGroupItem key={value} value={value} className="px-4">
                          {text}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <CustomerPicker form={form} initialName={draft?.buyer?.name} required={subtype === 'STANDARD'} />
            {isNote ? (
              <TextField control={control} name="noteReason" label="Reason for the note" autoComplete="off" />
            ) : null}
          </FormSection>

          <FormSection title="Dates and payment" description="The supply date is when the goods or services were delivered.">
            <div className="grid gap-5 sm:grid-cols-3">
              <TextField
                control={control}
                name="supplyDate"
                label={subtype === 'STANDARD' ? 'Supply date' : 'Supply date (optional)'}
                type="date"
              />
              <TextField control={control} name="supplyEndDate" label="Supply end date (optional)" type="date" />
              <SelectField
                control={control}
                name="paymentMeansCode"
                label="Payment method"
                options={PAYMENT_MEANS_LABELS}
                noneLabel="Not specified"
                placeholder="Not specified"
              />
            </div>
          </FormSection>

          <FormSection title="Lines" description="Prices are entered without VAT. VAT is calculated per line and rounded once per tax category.">
            <div className="flex flex-col">
              {fields.map((f, i) => (
                <LineEditor
                  key={f.id}
                  index={i}
                  form={form}
                  net={preview.result?.lines[i]}
                  canRemove={fields.length > 1}
                  onRemove={() => remove(i)}
                />
              ))}
              {form.formState.errors.lines?.root?.message || form.formState.errors.lines?.message ? (
                <p role="alert" className="pt-2 text-sm text-destructive">
                  {form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message}
                </p>
              ) : null}
            </div>
            <Button type="button" variant="outline" className="w-fit" onClick={() => append(EMPTY_LINE)}>
              <IconPlus />
              Add line
            </Button>
          </FormSection>

          <FormSection title="Discount and notes" description="A document discount needs every line to share one tax category.">
            <div className="grid gap-5 sm:grid-cols-2">
              <MoneyField control={control} name="docDiscountHalalas" label="Document discount (SAR)" />
              {hasDiscount ? (
                <TextField control={control} name="docDiscountReason" label="Discount reason" autoComplete="off" />
              ) : null}
            </div>
            <FormField
              control={control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Totals" description="Calculated as you type. The server recalculates when you save.">
            <TotalsSummary preview={preview} />
          </FormSection>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t pt-6">
          <div className="ml-auto flex items-center gap-3">
            {draft && form.formState.isDirty && !save.isPending ? (
              <span className="text-sm text-muted-foreground">Unsaved changes</span>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/app/invoices">{draft ? 'Back' : 'Cancel'}</Link>
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader /> : draft ? 'Save draft' : 'Create draft'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}

function CustomerPicker({
  form,
  initialName,
  required,
}: {
  form: UseFormReturn<DocumentDraftInput, unknown, DocumentDraftData>;
  initialName?: string;
  required: boolean;
}) {
  const [q, setQ] = useState('');
  const [name, setName] = useState(initialName);
  const { data, isFetching } = useCustomers(q);
  const options = (data?.pages.flatMap((p) => p.items) ?? []).map((c) => ({
    id: c.id,
    label: c.name,
    detail: c.vatNumber ? `VAT ${c.vatNumber}` : (c.city ?? undefined),
  }));
  return (
    <FormField
      control={form.control}
      name="customerId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>{required ? 'Customer' : 'Customer (optional)'}</FormLabel>
          <FormControl>
            <Picker
              value={field.value || null}
              selectedLabel={name}
              options={options}
              loading={isFetching}
              placeholder={required ? 'Select a customer' : 'Walk-in buyer'}
              searchPlaceholder="Search by name or VAT number"
              emptyText="No customers found."
              onSearch={setQ}
              onSelect={(o) => {
                setName(o.label);
                field.onChange(o.id);
              }}
              onClear={required ? undefined : () => field.onChange('')}
              clearLabel="Walk-in buyer (no customer)"
              invalid={!!form.formState.errors.customerId}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OriginalPicker({
  form,
  initial,
}: {
  form: UseFormReturn<DocumentDraftInput, unknown, DocumentDraftData>;
  initial?: DocumentDTO;
}) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useDocuments({ kind: 'INVOICE', status: 'ISSUED', q });
  const options = (data?.pages.flatMap((p) => p.items) ?? []).map((d) => ({
    id: d.id,
    label: d.number ?? d.id,
    detail: [d.customerName, formatAmount(d.payableHalalas)].filter(Boolean).join(' · '),
  }));
  return (
    <FormField
      control={form.control}
      name="billingReferenceId"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Original invoice</FormLabel>
          <FormControl>
            <Picker
              value={field.value || null}
              selectedLabel={initial?.billingReference?.number ?? undefined}
              options={options}
              loading={isFetching}
              placeholder="Select an issued invoice"
              searchPlaceholder="Search by invoice number or customer"
              emptyText="No issued invoices found."
              onSearch={setQ}
              invalid={!!form.formState.errors.billingReferenceId}
              onSelect={async (o) => {
                field.onChange(o.id);
                // The note follows the original's type and customer.
                const original = await apiFetch<DocumentDTO>(`/api/app/documents/${encodeURIComponent(o.id)}`).catch(() => null);
                if (!original) return;
                form.setValue('subtype', original.subtype, { shouldDirty: true });
                if (original.customerId) form.setValue('customerId', original.customerId, { shouldDirty: true });
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function LineEditor({
  index,
  form,
  net,
  canRemove,
  onRemove,
}: {
  index: number;
  form: UseFormReturn<DocumentDraftInput, unknown, DocumentDraftData>;
  net?: { netHalalas: number; vatHalalas: number; totalHalalas: number };
  canRemove: boolean;
  onRemove: () => void;
}) {
  const { control, setValue } = form;
  const p = (k: keyof DocumentLineInput) => `lines.${index}.${k}` as `lines.${number}.description`;
  const category = useWatch({ control, name: `lines.${index}.taxCategory` });
  const code = useWatch({ control, name: `lines.${index}.exemptionReasonCode` });

  // Switching category drops a code that belongs to another one.
  useEffect(() => {
    if (code && VATEX_REASONS[code]?.category !== category) setValue(p('exemptionReasonCode'), '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const reasons = Object.fromEntries(
    (category === 'Z' || category === 'E' ? EXEMPTION_REASONS[category] : []).map((r) => [r.code, `${r.code}: ${r.text}`]),
  );

  return (
    <div className="flex flex-col gap-4 border-b py-5 first:pt-0" role="group" aria-label={`Line ${index + 1}`}>
      <div className="flex items-start gap-3">
        <span className="pt-8 text-sm text-muted-foreground tabular-nums" aria-hidden>
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
          <TextField control={control} name={p('description')} label="Description" autoComplete="off" />
          <TextField
            control={control}
            name={p('descriptionAr')}
            label="Description in Arabic (optional)"
            dir="rtl"
            lang="ar"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 text-muted-foreground"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`Remove line ${index + 1}`}
        >
          <IconTrash />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 pl-6 sm:grid-cols-3 lg:grid-cols-6">
        <TextField control={control} name={p('quantity')} label="Quantity" inputMode="decimal" className="tabular-nums" />
        <TextField control={control} name={p('unitCode')} label="Unit" maxLength={3} className="uppercase" autoComplete="off" />
        <MoneyField control={control} name={p('unitPriceHalalas')} label="Unit price" />
        <MoneyField control={control} name={p('lineDiscountHalalas')} label="Discount" />
        <div className="col-span-2 sm:col-span-3 lg:col-span-2">
          <SelectField control={control} name={p('taxCategory')} label="VAT" options={TAX_CATEGORY_LABELS} />
        </div>
      </div>
      {category === 'Z' || category === 'E' ? (
        <div className="pl-6">
          <SelectField
            control={control}
            name={p('exemptionReasonCode')}
            label="Reason for no VAT"
            options={reasons}
            placeholder="Select the reason code"
          />
        </div>
      ) : category === 'O' ? (
        <div className="pl-6">
          <TextField control={control} name={p('exemptionReason')} label="Reason it is out of scope" autoComplete="off" />
        </div>
      ) : null}
      {net ? (
        <p className="pl-6 text-sm text-muted-foreground tabular-nums">
          Net {formatAmount(net.netHalalas)} · VAT {formatAmount(net.vatHalalas)} · Total {formatAmount(net.totalHalalas)} SAR
        </p>
      ) : null}
    </div>
  );
}

function TotalsSummary({ preview }: { preview: ReturnType<typeof usePreview> }) {
  if (!preview.result) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Totals will appear once the lines are complete{preview.error ? `: ${preview.error}` : ''}.
      </p>
    );
  }
  const { totals, taxSubtotals } = preview.result;
  const rows: [string, number, boolean?][] = [
    ['Subtotal (excl. VAT)', totals.lineExtensionHalalas],
    ...(totals.allowanceTotalHalalas ? ([['Discount', -totals.allowanceTotalHalalas]] as [string, number][]) : []),
    ['Taxable amount', totals.taxExclusiveHalalas],
    ...taxSubtotals.map((s): [string, number] => [
      `VAT ${s.taxCategory} ${s.taxRateBp / 100}%${s.exemptionReasonCode ? ` (${s.exemptionReasonCode})` : ''}`,
      s.taxHalalas,
    ]),
    ['Total to pay', totals.payableHalalas, true],
  ];
  return (
    <dl className="ml-auto flex w-full max-w-sm flex-col gap-2 tabular-nums" aria-live="polite">
      {rows.map(([label, value, strong]) => (
        <div key={label} className={strong ? 'flex justify-between border-t pt-3 text-lg font-semibold' : 'flex justify-between text-sm'}>
          <dt className={strong ? undefined : 'text-muted-foreground'}>{label}</dt>
          <dd>
            {value < 0 ? '-' : ''}
            {formatAmount(Math.abs(value))} <span className="text-xs font-normal text-muted-foreground">SAR</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
