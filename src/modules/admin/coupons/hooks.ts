'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Coupon } from '@prisma/client';

import { apiFetch } from '@/lib/fetcher';
import type { CouponInput } from '@/contracts/coupons';

const KEY = ['admin', 'coupons'] as const;

export function useAdminCoupons() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<{ items: Coupon[] }>('/api/admin/coupons').then((r) => r.items),
  });
}

export function useCouponMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: (input: CouponInput) =>
      apiFetch<{ coupon: Coupon }>('/api/admin/coupons', { method: 'POST', body: input }),
    onSuccess: () => toast.success('Coupon created'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not create coupon'),
    onSettled: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CouponInput }) =>
      apiFetch<{ coupon: Coupon }>(`/api/admin/coupons/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('Coupon updated'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update coupon'),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/coupons/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Coupon removed'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove coupon'),
    onSettled: invalidate,
  });

  return { create, update, remove };
}
