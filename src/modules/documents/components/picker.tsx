'use client';

import { useEffect, useState } from 'react';
import { IconCheck, IconSelector } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface PickerOption {
  id: string;
  label: string;
  detail?: string;
}

/**
 * Searchable single-select. Options come from the server (`onSearch` drives the query), so the
 * list is shown as returned (shouldFilter off). `selectedLabel` covers a value not in the current results.
 */
export function Picker({
  id,
  options,
  value,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  emptyText,
  loading,
  disabled,
  invalid,
  onSearch,
  onOpenChange,
  onSelect,
  onClear,
  clearLabel,
}: {
  id?: string;
  options: PickerOption[];
  value: string | null;
  selectedLabel?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onSearch: (q: string) => void;
  onOpenChange?: (open: boolean) => void;
  onSelect: (option: PickerOption) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debouncedQ = useDebouncedValue(q.trim());
  useEffect(() => {
    onSearch(debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);
  const label = options.find((o) => o.id === value)?.label ?? selectedLabel;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        onOpenChange?.(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>{value ? (label ?? '…') : placeholder}</span>
          <IconSelector className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} />
          <CommandList>
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</div>
            ) : (
              <CommandEmpty>{emptyText}</CommandEmpty>
            )}
            <CommandGroup>
              {onClear && value ? (
                <CommandItem
                  value="__clear"
                  onSelect={() => {
                    onClear();
                    setOpen(false);
                  }}
                >
                  {clearLabel ?? 'Clear'}
                </CommandItem>
              ) : null}
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    onSelect(o);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.detail ? <span className="truncate text-xs text-muted-foreground">{o.detail}</span> : null}
                  </div>
                  {o.id === value ? <IconCheck className="size-4" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
