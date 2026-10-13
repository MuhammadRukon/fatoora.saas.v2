'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { WarrantyRequest, WarrantyStatus } from '@prisma/client';

import { apiFetch } from '@/lib/fetcher';

interface AdminWarrantyRequest extends WarrantyRequest {
  user: { id: string; name: string | null; email: string | null } | null;
  order: { id: string; orderNumber: string; totalCents: number };
}

export function useSubmitWarranty(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<{ warranty: WarrantyRequest }>(`/api/orders/${orderId}/warranty`, {
        method: 'POST',
        body: { reason },
      }),
    onSuccess: () => {
      toast.success('Warranty request submitted');
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['warranty'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not submit request'),
  });
}

export function useAdminWarrantyList(status?: WarrantyStatus) {
  return useQuery({
    queryKey: ['admin', 'warranty', status ?? 'all'],
    queryFn: () =>
      apiFetch<{ items: AdminWarrantyRequest[] }>(
        `/api/admin/warranty${status ? `?status=${status}` : ''}`,
      ).then((r) => r.items),
  });
}

export function useTransitionWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      resolution,
    }: {
      id: string;
      status: WarrantyStatus;
      resolution?: string;
    }) =>
      apiFetch<{ warranty: WarrantyRequest }>(`/api/admin/warranty/${id}`, {
        method: 'PATCH',
        body: { status, resolution },
      }),
    onSuccess: () => {
      toast.success('Warranty updated');
      qc.invalidateQueries({ queryKey: ['admin', 'warranty'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not update warranty'),
  });
}
