import type { PaymentMethod } from '@prisma/client';

import type { CheckoutQuote } from '@/contracts/checkout';

/** What a checkout quote depends on; also the identity of its cache entry. */
export interface CheckoutQuoteParams {
  addressId: string;
  /** The applied coupon, or null when none. */
  couponCode: string | null;
  /** The effective selection, or null while none is chosen (or the config has not loaded). */
  paymentMethod: PaymentMethod | null;
}

/**
 * Request body of `POST /api/checkout/quote`. Null becomes undefined so the
 * key is omitted from the JSON, exactly as the route's optional fields expect.
 */
export function buildQuoteBody({ addressId, couponCode, paymentMethod }: CheckoutQuoteParams) {
  return {
    addressId,
    couponCode: couponCode ?? undefined,
    paymentMethod: paymentMethod ?? undefined,
  };
}

/**
 * Whether the COD confirmation-fee UI (notice, QR/contact, txn id field) shows.
 * It follows the settled quote, not the cached payment config: the quote is
 * what the server will charge, so an admin turning the fee on mid-session
 * still surfaces it. While re-quoting, the old quote may belong to a
 * different method, so nothing shows.
 */
export function isCodFeeActive({
  paymentMethod,
  quoting,
  quote,
}: {
  paymentMethod: PaymentMethod | null;
  quoting: boolean;
  quote: CheckoutQuote | null;
}): boolean {
  return (
    paymentMethod === 'COD' && !quoting && !!quote && quote.codFeeCents > 0 && !!quote.codFeeRule
  );
}

/**
 * The quote shows a fee but the cached config still says the fee is off:
 * the config is stale and should be refetched once.
 */
export function isFeeConfigStale(feeActive: boolean, configFeeEnabled: boolean | undefined) {
  return feeActive && configFeeEnabled === false;
}
