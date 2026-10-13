'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/fetcher';
import type { Order, OrderEvent, OrderItem, Address } from '@prisma/client';

import type { CustomerPayment } from '@/contracts/payments';

type OrderListItem = Order & { items: OrderItem[]; payments: CustomerPayment[] };
type OrderWithDetails = Order & {
  items: OrderItem[];
  payments: CustomerPayment[];
  events: OrderEvent[];
  address: Address | null;
};

export type { OrderWithDetails };

export function useMyOrders() {
  return useQuery({
    queryKey: ['orders', 'me'],
    queryFn: () => apiFetch<{ items: OrderListItem[] }>('/api/orders').then((r) => r.items),
  });
}

export function useOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () =>
      apiFetch<{ order: OrderWithDetails }>(`/api/orders/${id}`).then((r) => r.order),
    enabled: !!id,
  });
}

export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<{ order: OrderWithDetails }>(`/api/orders/${id}?action=cancel`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      toast.success('Order cancelled');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not cancel order'),
  });
}

/**
 * Adds the customer's transaction id to a COD confirmation-fee payment
 * (add-only: the server rejects a second submission). Errors are left to the
 * caller so the duplicate case can render its own copy.
 */
export function useSubmitTxnId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { paymentId: string; txnId: string }) =>
      apiFetch<{ payment: CustomerPayment }>('/api/payments/txn-id', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success('Transaction ID submitted');
      void qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
