'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Address } from '@prisma/client';

import { apiFetch } from '@/lib/fetcher';
import type { AddressInput } from '@/contracts/address';

const ADDRESSES_KEY = ['addresses'] as const;

export function useAddresses() {
  return useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: () => apiFetch<{ items: Address[] }>('/api/addresses').then((r) => r.items),
  });
}

export function useAddressMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY });

  const create = useMutation({
    mutationFn: (input: AddressInput) =>
      apiFetch<{ address: Address }>('/api/addresses', { method: 'POST', body: input }),
    onSuccess: () => toast.success('Address saved'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not save address'),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddressInput }) =>
      apiFetch<{ address: Address }>(`/api/addresses/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('Address updated'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not update address'),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Address removed'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not remove address'),
    onSettled: invalidate,
  });

  return { create, update, remove };
}
