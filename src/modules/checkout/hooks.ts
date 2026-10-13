'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod } from '@prisma/client';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { CheckoutInput, CheckoutQuote } from '@/contracts/checkout';
import type { PublicPaymentConfig } from '@/contracts/payment-settings';
import type { TxnCheckResult } from '@/contracts/payments';
import { checkoutErrorMessage, isPaymentMethodUnavailable } from './checkout-error';
import { buildQuoteBody } from './checkout-quote';

export interface PlaceOrderResult {
  id: string;
  orderNumber: string;
  totalCents: number;
  paymentId: string;
  redirectUrl: string | null;
  /** True when a COD confirmation fee must be verified before the order is confirmed. */
  feeRequired: boolean;
}

/**
 * Enabled payment methods, COD fee rule, QR, contact and note. The admin can
 * change it at any time, so it goes stale after 30 seconds; no refetch on
 * window focus. Quote and place-order re-check the chosen method on the server,
 * and a "method no longer available" answer invalidates this key.
 */
export function usePaymentConfig({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.paymentConfig,
    enabled,
    queryFn: () => apiFetch<PublicPaymentConfig>('/api/checkout/config'),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    // One quick retry, then surface the error state instead of spinning.
    retry: 1,
  });
}

/**
 * Server-side totals for one checkout selection (address, applied coupon,
 * payment method). Every distinct selection is its own cache entry and is
 * always fetched fresh: no placeholder data, so a new selection never shows
 * another selection's quote, and nothing is kept once the page unmounts
 * (`gcTime: 0`), so a return visit neither re-shows an old quote nor replays
 * an old error. No retry: a rejected quote (stock conflict, bad coupon,
 * method turned off) is meaningful, so the caller handles it once via `error`.
 *
 * `enabled` lets the caller wait (e.g. for the payment config) before the
 * first request; it is also off until an address is chosen.
 */
export function useCheckoutQuote({
  addressId,
  couponCode,
  paymentMethod,
  enabled = true,
}: {
  addressId: string | null;
  couponCode: string | null;
  paymentMethod: PaymentMethod | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.checkoutQuote({ addressId, couponCode, paymentMethod }),
    enabled: enabled && !!addressId,
    queryFn: () => {
      if (!addressId) throw new Error('Checkout quote requested without an address');
      return apiFetch<CheckoutQuote>('/api/checkout/quote', {
        method: 'POST',
        body: buildQuoteBody({ addressId, couponCode, paymentMethod }),
      });
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Whether a transaction id is already attached to a payment. Boolean only
 * (no order info). Call on blur with a format-valid id, never per keystroke.
 */
export function useTxnCheck() {
  return useMutation({
    mutationFn: (txnId: string) =>
      apiFetch<TxnCheckResult>('/api/payments/txn-check', { method: 'POST', body: { txnId } }),
  });
}

/**
 * Places an order. The cart is invalidated on both outcomes: success
 * empties it server-side, and any failure (stock conflict, empty cart)
 * may have left the cached snapshot stale. A "method no longer available"
 * failure also refetches the payment config so the list catches up.
 */
export function usePlaceOrder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: CheckoutInput) =>
      apiFetch<PlaceOrderResult>('/api/checkout', { method: 'POST', body: input }),
    onSuccess: (res) => {
      toast.success(
        res.feeRequired
          ? `Order ${res.orderNumber} placed. It will be confirmed once the confirmation fee is verified.`
          : `Order ${res.orderNumber} placed`,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.cart });
    },
    onError: (err) => {
      toast.error(checkoutErrorMessage(err));
      void qc.invalidateQueries({ queryKey: queryKeys.cart });
      if (isPaymentMethodUnavailable(err)) {
        void qc.invalidateQueries({ queryKey: queryKeys.paymentConfig });
      }
    },
  });
}
