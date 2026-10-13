import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type {
  SubscriptionCreateInput,
  SubscriptionDTO,
  SubscriptionStateDTO,
} from '@/contracts/subscriptions';

export function useSubscriptionState() {
  return useQuery({
    queryKey: queryKeys.subscriptionState,
    queryFn: () => apiFetch<SubscriptionStateDTO>('/api/subscriptions/me'),
  });
}

export function useRequestPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubscriptionCreateInput) =>
      apiFetch<SubscriptionDTO>('/api/subscriptions', { method: 'POST', body: input }),
    onSuccess: () => toast.success('Plan requested. An admin will activate it shortly.'),
    onError: (err) =>
      toast.error(err instanceof ApiClientError ? err.message : 'Could not request plan'),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.subscriptionState }),
  });
}
