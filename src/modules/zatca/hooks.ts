import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/queryKeys';
import type { OnboardResultDTO, ZatcaStatusDTO } from '@/contracts/zatca';
import { apiFetch } from '@/lib/fetcher';

export function useZatcaStatus() {
  return useQuery({ queryKey: queryKeys.zatca, queryFn: () => apiFetch<ZatcaStatusDTO>('/api/app/zatca') });
}

/** Failures that reach the UI as errors (429, 422, 409) are surfaced by the caller via `mutation.error`. */
export function useOnboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (otp: string) => apiFetch<OnboardResultDTO>('/api/app/zatca/onboard', { method: 'POST', body: { otp } }),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.zatca }),
  });
}
