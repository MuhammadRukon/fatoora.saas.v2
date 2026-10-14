'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

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

/** One titled block of a settings-style form: description on the left, fields on the right. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-x-12 gap-y-5 py-8 first:pt-0 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-medium">{title}</h2>
        {description ? (
          <div className="text-sm text-pretty text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="grid content-start gap-5">{children}</div>
    </section>
  );
}

interface FieldProps<T extends FieldValues> {
  // Any transformed (resolver output) type: these fields only read and write the input values.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  hint?: ReactNode;
}

/** Labelled text input bound to react-hook-form. `dir="rtl" lang="ar"` for Arabic fields. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...input
}: FieldProps<T> & Omit<ComponentProps<'input'>, 'name' | 'value' | 'onChange' | 'onBlur'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...input} {...field} value={field.value ?? ''} />
          </FormControl>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Labelled select. With `noneLabel`, the field is optional and that option clears it (''). */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  options,
  noneLabel,
  placeholder = 'Select',
}: FieldProps<T> & {
  options: Record<string, string>;
  noneLabel?: string;
  placeholder?: string;
}) {
  const NONE = '__none';
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value || (noneLabel ? NONE : '')}
            onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
          >
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur} ref={field.ref}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
              {Object.entries(options).map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
