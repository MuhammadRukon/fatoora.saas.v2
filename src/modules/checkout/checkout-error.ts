import { ApiClientError } from '@/lib/fetcher';
import { paymentMethodUnavailableMetaSchema, stockConflictMetaSchema } from '@/contracts/checkout';

export const TXN_ID_DUPLICATE_MESSAGE =
  'Transaction ID already exists. You can place the order without a transaction ID and contact admin.';
export const PAYMENT_METHOD_UNAVAILABLE_MESSAGE = 'That payment method is no longer available';

/** 409 `TXN_ID_DUPLICATE`: the customer-supplied transaction id is already attached to a payment. */
export function isTxnIdDuplicate(err: unknown): boolean {
  return err instanceof ApiClientError && err.payload?.code === 'TXN_ID_DUPLICATE';
}

/** 400 with `meta.reason === 'payment_method_unavailable'`: the admin disabled the chosen method. */
export function isPaymentMethodUnavailable(err: unknown): boolean {
  return (
    err instanceof ApiClientError &&
    err.status === 400 &&
    paymentMethodUnavailableMetaSchema.safeParse(err.payload?.meta).success
  );
}

export function checkoutErrorMessage(err: unknown): string {
  if (!(err instanceof ApiClientError)) return 'Could not place order';

  if (isTxnIdDuplicate(err)) return TXN_ID_DUPLICATE_MESSAGE;
  if (isPaymentMethodUnavailable(err)) return PAYMENT_METHOD_UNAVAILABLE_MESSAGE;

  if (err.status === 409) {
    const meta = stockConflictMetaSchema.safeParse(err.payload?.meta);
    if (meta.success) {
      const { productName, reason } = meta.data;
      return reason === 'unavailable'
        ? `"${productName}" is no longer available. Your cart has been refreshed.`
        : `Not enough stock for "${productName}". Your cart has been refreshed.`;
    }
  }

  return err.message;
}
