'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Payment } from '@prisma/client';
import { toast } from 'sonner';

import { ApiClientError, apiFetch } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';

interface PendingPayment extends Payment {
  order: {
    id: string;
    orderNumber: string;
    totalCents: number;
    shipRecipient: string;
    shipPhone: string;
    shipCity: string;
    createdAt: string | Date;
    user: { id: string; name: string | null; email: string | null } | null;
  };
}

export function useAdminPendingPayments() {
  return useQuery({
    queryKey: queryKeys.adminPaymentsPending,
    queryFn: () =>
      apiFetch<{ items: PendingPayment[] }>('/api/admin/payments').then((r) => r.items),
  });
}

export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string;
      outcome: 'SUCCEEDED' | 'FAILED';
      note?: string;
    }) =>
      apiFetch<{ payment: Payment }>(`/api/admin/payments/${id}/verify`, {
        method: 'POST',
        body: { outcome, note },
      }),
    onSuccess: (_data, vars) =>
      toast.success(vars.outcome === 'SUCCEEDED' ? 'Payment verified' : 'Payment rejected'),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not update payment'),
    // Verifying can also confirm the order, so refresh the order views too. Also
    // on error: a 409 means someone else already decided, so show fresh state.
    onSettled: (data) => invalidateAdminPaymentViews(qc, data?.payment.orderId),
  });
}

export interface DuplicateTxnInfo {
  existingOrderId: string;
  existingOrderNumber: string;
}

/**
 * The 409 `TXN_ID_DUPLICATE` payload the admin txn-id route returns carries
 * `meta: {existingOrderId, existingOrderNumber}` (`ApiClientError.payload.meta`).
 * Returns it, or null for any other error.
 */
export function getDuplicateTxnInfo(err: unknown): DuplicateTxnInfo | null {
  if (!(err instanceof ApiClientError) || err.status !== 409) return null;
  const meta = err.payload?.meta;
  if (
    meta &&
    typeof meta.existingOrderId === 'string' &&
    typeof meta.existingOrderNumber === 'string'
  ) {
    return { existingOrderId: meta.existingOrderId, existingOrderNumber: meta.existingOrderNumber };
  }
  return null;
}

/**
 * Refetch what an admin fee/txn change can touch, without a manual reload:
 * the orders list, that order's detail, and the pending-payments list. The
 * order id comes from the response; when the request failed there is none, so
 * every cached order detail is marked stale instead (only mounted ones refetch).
 */
function invalidateAdminPaymentViews(
  qc: ReturnType<typeof useQueryClient>,
  orderId: string | undefined,
) {
  qc.invalidateQueries({ queryKey: queryKeys.adminOrdersList });
  qc.invalidateQueries({
    queryKey: orderId ? queryKeys.adminOrderDetail(orderId) : queryKeys.adminOrderDetails,
  });
  qc.invalidateQueries({ queryKey: queryKeys.adminPaymentsPending });
}

/** Verify or reject the COD confirmation fee (`POST /api/admin/payments/[id]/fee`). */
export function useVerifyCodFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string;
      outcome: 'VERIFIED' | 'REJECTED';
      note?: string;
    }) =>
      apiFetch<{ payment: Payment }>(`/api/admin/payments/${id}/fee`, {
        method: 'POST',
        body: { outcome, note: note?.trim() ? note.trim() : undefined },
      }),
    onSuccess: (_data, vars) =>
      toast.success(
        vars.outcome === 'VERIFIED' ? 'Fee verified, order confirmed' : 'Confirmation fee rejected',
      ),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not update the confirmation fee'),
    // Also on error: a 409 means someone else already decided, so show fresh state.
    onSettled: (data) => invalidateAdminPaymentViews(qc, data?.payment.orderId),
  });
}

/**
 * Set or replace the customer transaction id on the admin's behalf
 * (`POST /api/admin/payments/[id]/txn-id`). A duplicate id is NOT toasted:
 * the caller opens `DuplicateTxnDialog` using `getDuplicateTxnInfo(error)`.
 */
export function useAdminSetTxnId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, txnId }: { id: string; txnId: string }) =>
      apiFetch<{ payment: Payment }>(`/api/admin/payments/${id}/txn-id`, {
        method: 'POST',
        body: { txnId },
      }),
    onSuccess: () => toast.success('Transaction ID saved'),
    onError: (err) => {
      if (getDuplicateTxnInfo(err)) return;
      toast.error(err instanceof Error ? err.message : 'Could not save the transaction ID');
    },
    onSettled: (data) => invalidateAdminPaymentViews(qc, data?.payment.orderId),
  });
}
