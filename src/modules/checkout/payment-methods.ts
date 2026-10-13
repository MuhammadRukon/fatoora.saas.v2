import type { PaymentMethod } from '@prisma/client';

/** Display copy only. Which methods exist is decided by the server (`/api/checkout/config`). */
export const PAYMENT_METHOD_INFO: Record<PaymentMethod, { label: string }> = {
  COD: { label: 'Cash on delivery (COD)' },
  BKASH: { label: 'bKash' },
  SSLCOMMERZ: { label: 'Card / mobile banking (SSLCommerz)' },
  BANK_TRANSFER: { label: 'Bank transfer (manual verification)' },
};

/** COD if enabled, otherwise the first enabled method. */
export function defaultPaymentMethod(methods: readonly PaymentMethod[]): PaymentMethod | null {
  if (methods.includes('COD')) return 'COD';
  return methods[0] ?? null;
}

/**
 * The method that is actually selected, given the customer's pick.
 * `undefined` = no pick yet (use the default). A pick that is no longer
 * enabled resolves to `null` so the customer re-chooses explicitly rather
 * than being silently switched to a different way of paying.
 */
export function effectiveSelection(
  selected: PaymentMethod | null | undefined,
  methods: readonly PaymentMethod[],
): PaymentMethod | null {
  if (selected === undefined) return defaultPaymentMethod(methods);
  return selected && methods.includes(selected) ? selected : null;
}
