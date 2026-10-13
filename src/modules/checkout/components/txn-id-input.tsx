import type { ComponentProps } from 'react';

import { Input } from '@/components/ui/input';

type FixedProps = 'placeholder' | 'autoComplete' | 'autoCapitalize' | 'maxLength';

/**
 * The transaction-id text input shared by the checkout field and the
 * order-page add-only card. Fixes the attributes both must agree on; each
 * caller owns its own value, validation, messages and submit behavior.
 */
export function TxnIdInput(props: Omit<ComponentProps<typeof Input>, FixedProps>) {
  return (
    <Input
      placeholder="e.g. 9A7B3C2D1E"
      autoComplete="off"
      autoCapitalize="characters"
      maxLength={64}
      {...props}
    />
  );
}
