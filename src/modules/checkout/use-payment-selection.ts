'use client';

import { useEffect, useState } from 'react';
import type { PaymentMethod } from '@prisma/client';

import { defaultPaymentMethod, effectiveSelection } from '@/modules/checkout/payment-methods';

/**
 * The customer's payment method pick, as a tri-state:
 * `undefined` = no pick yet; pinned to the default once the config loads.
 * `null`      = the picked method disappeared from the config (or no default
 *               exists); the customer must re-choose explicitly, never a
 *               silent switch to a different way of paying.
 * method      = an explicit pick.
 * `paymentMethod` is what is actually selected for the current method list.
 */
export function usePaymentSelection(methods: readonly PaymentMethod[] | undefined) {
  const [selected, setSelected] = useState<PaymentMethod | null | undefined>(undefined);
  const paymentMethod = effectiveSelection(selected, methods ?? []);

  useEffect(() => {
    if (methods && selected === undefined) {
      setSelected(defaultPaymentMethod(methods));
    }
  }, [methods, selected]);

  return { paymentMethod, select: setSelected };
}
