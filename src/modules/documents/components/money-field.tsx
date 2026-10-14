'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { fromHalalas, toHalalas } from '@/server/common/money';
import { cn } from '@/lib/utils';

const parse = (text: string) => {
  if (!text.trim()) return 0;
  try {
    return toHalalas(text);
  } catch {
    return Number.NaN;
  }
};

function MoneyInput({
  value,
  onChange,
  className,
  ...input
}: { value: number; onChange: (halalas: number) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? fromHalalas(value) : '');
  // Follow outside changes (form reset, duplicate) without fighting what is being typed.
  useEffect(() => {
    if (parse(text) !== value && !(Number.isNaN(value) && Number.isNaN(parse(text)))) {
      setText(Number.isFinite(value) && value ? fromHalalas(value) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      {...input}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0.00"
      className={cn('tabular-nums', className)}
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^0-9.]/g, '');
        setText(next);
        onChange(parse(next));
      }}
      onBlur={(e) => {
        const halalas = parse(text);
        if (Number.isFinite(halalas) && halalas) setText(fromHalalas(halalas));
        input.onBlur?.(e);
      }}
    />
  );
}

/** A SAR amount typed with decimals, stored in the form as integer halalas (what the contract wants). */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  hint,
  ...input
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: string;
  hint?: string;
} & Omit<ComponentProps<'input'>, 'name' | 'value' | 'onChange'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="min-w-0">
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <MoneyInput {...input} name={field.name} ref={field.ref} value={field.value ?? 0} onChange={field.onChange} />
          </FormControl>
          {hint ? <FormDescription>{hint}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
