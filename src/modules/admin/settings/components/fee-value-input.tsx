'use client';

import { useState, type ComponentProps } from 'react';
import { CodFeeType } from '@prisma/client';

import { Input } from '@/components/ui/input';

/**
 * Fee amount input. FLAT edits whole BDT (stored as cents, x100); PERCENT
 * edits an integer 1-100. Keeps its own text so typing is never rewritten
 * under the cursor; the form always holds the contract's units.
 */
export function FeeValueInput({
  type,
  value,
  onChange,
  ...inputProps
}: {
  type: CodFeeType;
  value: number;
  onChange: (next: number) => void;
} & Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'>) {
  const fromForm = type === CodFeeType.PERCENT ? value : value / 100;
  const [text, setText] = useState(String(fromForm));
  const [lastSynced, setLastSynced] = useState({ type, value });

  // Re-sync only when the form value changed from outside (type switch, reset).
  if (lastSynced.type !== type || lastSynced.value !== value) {
    setLastSynced({ type, value });
    setText(String(fromForm));
  }

  return (
    <Input
      {...inputProps}
      inputMode={type === CodFeeType.PERCENT ? 'numeric' : 'decimal'}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = Number(raw);
        // Unparseable input becomes 0, which the contract rejects with its
        // own message ("Flat fee must be ..." / "Percentage must be ...").
        const next =
          raw.trim() === '' || !Number.isFinite(n)
            ? 0
            : type === CodFeeType.PERCENT
              ? n
              : Math.round(n * 100);
        setLastSynced({ type, value: next });
        onChange(next);
      }}
    />
  );
}
