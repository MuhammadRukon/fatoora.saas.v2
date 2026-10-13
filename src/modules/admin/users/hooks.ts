import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { SubscriptionDTO } from '@/contracts/subscriptions';
import type { AdminUser } from '@/server/users/users.service';

const USERS_URL = '/api/admin/users';

function explainError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: () => apiFetch<{ items: AdminUser[] }>(USERS_URL).then((r) => r.items),
  });
}

export function useActivateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) =>
      apiFetch<SubscriptionDTO>(`/api/admin/subscriptions/${subscriptionId}/activate`, {
        method: 'POST',
      }),
    onSuccess: () => toast.success('Subscription activated'),
    onError: (err) => toast.error(explainError(err, 'Could not activate subscription')),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.user }),
  });
}
