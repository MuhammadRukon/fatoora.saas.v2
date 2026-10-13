'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { TXN_ID_DUPLICATE_MESSAGE } from '@/modules/checkout/checkout-error';
import { TxnIdInput } from '@/modules/checkout/components/txn-id-input';
import { useTxnCheck } from '@/modules/checkout/hooks';
import {
  TXN_CHECK_UNAVAILABLE_MESSAGE,
  TXN_ID_FORMAT_HINT,
  parseTxnIdInput,
} from '@/modules/checkout/txn-id';

interface TxnIdFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** True when the entered id is known to exist already (blur check or server 409). */
  duplicate: boolean;
  onDuplicateChange: (duplicate: boolean) => void;
}

/**
 * Optional transaction-id input for the COD confirmation fee.
 *
 * The duplicate check runs on blur only (never per keystroke, no debounced
 * search) and only for ids that pass the server's format rules, so a
 * typo-prone half-typed id never hits `/api/payments/txn-check`. A duplicate
 * answer is boolean-only; the parent then omits the id from the order.
 */
export function TxnIdField({ value, onChange, duplicate, onDuplicateChange }: TxnIdFieldProps) {
  const inputId = useId();
  const check = useTxnCheck();
  const [touched, setTouched] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  // Latest text, readable from the async check callback (and synced when the parent clears it).
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  // Last id the server answered for, so re-blurring unchanged text makes no call.
  const lastChecked = useRef<string | null>(null);

  const parsed = parseTxnIdInput(value);
  const invalid = touched && parsed.status === 'invalid';

  function handleChange(next: string) {
    latest.current = next;
    setCheckFailed(false);
    lastChecked.current = null;
    if (duplicate) onDuplicateChange(false);
    onChange(next);
  }

  function handleBlur() {
    setTouched(true);
    const result = parseTxnIdInput(latest.current);
    if (result.status !== 'valid' || lastChecked.current === result.value) return;

    check.mutate(result.value, {
      onSuccess: (res) => {
        // Ignore the answer if the customer has edited the field since.
        const current = parseTxnIdInput(latest.current);
        if (current.status !== 'valid' || current.value !== result.value) return;
        lastChecked.current = result.value;
        setCheckFailed(false);
        onDuplicateChange(res.exists);
      },
      // 429 or any failure: neutral message, the order can still be placed.
      onError: () => setCheckFailed(true),
    });
  }

  const message = duplicate
    ? TXN_ID_DUPLICATE_MESSAGE
    : invalid
      ? TXN_ID_FORMAT_HINT
      : checkFailed
        ? TXN_CHECK_UNAVAILABLE_MESSAGE
        : null;
  const messageId = `${inputId}-msg`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Transaction ID (optional)</Label>
      <TxnIdInput
        id={inputId}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        aria-invalid={duplicate || invalid}
        aria-describedby={messageId}
      />
      <p
        id={messageId}
        role={message ? 'status' : undefined}
        className={
          duplicate || invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
        }
      >
        {message ??
          'If you already paid the confirmation fee, add the transaction ID. You can also add it later from your order page.'}
      </p>
    </div>
  );
}
