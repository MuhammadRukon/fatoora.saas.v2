'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod, PaymentSettings } from '@prisma/client';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { PaymentSettingsInput } from '@/contracts/payment-settings';

/** JSON wire form of the singleton (dates arrive as ISO strings). */
export type AdminPaymentSettings = Omit<PaymentSettings, 'updatedAt'> & { updatedAt: string };

export interface AdminPaymentSettingsResponse {
  settings: AdminPaymentSettings;
  /** Which methods are usable on this host (booleans only, never env values). */
  gatewayConfigured: Record<PaymentMethod, boolean>;
}

const KEY = ['admin', 'settings', 'payments'] as const;

export function useAdminPaymentSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<AdminPaymentSettingsResponse>('/api/admin/settings/payments'),
  });
}

export function useUpdatePaymentSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentSettingsInput) =>
      apiFetch<AdminPaymentSettingsResponse>('/api/admin/settings/payments', {
        method: 'PUT',
        body: input,
      }),
    onSuccess: (data) => {
      toast.success('Payment settings saved');
      qc.setQueryData(KEY, data);
      // The customer-facing config (Phase 4) must never serve stale settings.
      qc.invalidateQueries({ queryKey: queryKeys.paymentConfig });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Could not save payment settings');
      // Only on failure: success already wrote the fresh response into the cache.
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
