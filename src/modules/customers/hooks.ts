import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError, errorToast } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { CustomerData, CustomerDTO } from '@/contracts/customers';
import type { CursorPage } from '@/server/common/pagination';


export function useCustomers(q: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.customers.list(q),
    initialPageParam: '',
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' });
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      return apiFetch<CursorPage<CustomerDTO>>(`/api/app/customers?${params}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => apiFetch<CustomerDTO>(`/api/app/customers/${encodeURIComponent(id)}`),
    retry: (count, err) => !(err instanceof ApiClientError && err.status === 404) && count < 2,
  });
}

/** Creates when `id` is undefined, otherwise updates. */
export function useSaveCustomer(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerData) =>
      id
        ? apiFetch<CustomerDTO>(`/api/app/customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: input })
        : apiFetch<CustomerDTO>('/api/app/customers', { method: 'POST', body: input }),
    onSuccess: (customer) => {
      qc.setQueryData(queryKeys.customers.detail(customer.id), customer);
      void qc.invalidateQueries({ queryKey: queryKeys.customers.all, exact: false });
      toast.success(id ? 'Customer saved' : 'Customer added');
    },
    onError: errorToast('Could not save the customer'),
  });
}

export function useDeleteCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>(`/api/app/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: queryKeys.customers.detail(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      toast.success('Customer deleted');
    },
    onError: errorToast('Could not delete the customer'),
  });
}
