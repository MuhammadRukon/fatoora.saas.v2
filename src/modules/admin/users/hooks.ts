import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { AdminUserCreateInput, AdminUserUpdateInput } from '@/contracts/admin-users';
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

export function useAdminUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.user });

  const create = useMutation({
    mutationFn: (input: AdminUserCreateInput) =>
      apiFetch<{ user: AdminUser }>(USERS_URL, { method: 'POST', body: input }),
    onSuccess: () => toast.success('User created'),
    onError: (err) => toast.error(explainError(err, 'Could not create user')),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUserUpdateInput }) =>
      apiFetch<{ user: AdminUser }>(`${USERS_URL}/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('User updated'),
    onError: (err) => toast.error(explainError(err, 'Could not update user')),
    onSettled: invalidate,
  });

  return { create, update };
}
