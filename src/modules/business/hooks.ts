import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { BusinessDTO, BusinessUpsertData } from '@/contracts/business';

/** The user's business profile; null before setup. */
export function useBusiness() {
  return useQuery({
    queryKey: queryKeys.business,
    queryFn: () => apiFetch<BusinessDTO | null>('/api/app/business'),
  });
}

export function useSaveBusiness() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BusinessUpsertData) =>
      apiFetch<BusinessDTO>('/api/app/business', { method: 'PUT', body: input }),
    onSuccess: (business) => {
      qc.setQueryData(queryKeys.business, business);
      toast.success('Business profile saved');
    },
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : 'Could not save the business profile'),
  });
}
