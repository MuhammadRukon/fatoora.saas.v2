'use client';

import { useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/fetcher';
import type { AnalyticsOverview } from '@/contracts/analytics';

export function useAdminAnalyticsOverview() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'overview'],
    queryFn: () => apiFetch<AnalyticsOverview>('/api/admin/analytics'),
  });
}
