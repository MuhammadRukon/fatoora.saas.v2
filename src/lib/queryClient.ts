import { QueryClient } from '@tanstack/react-query';

/**
 * Single source of truth for React Query defaults. Used by the root
 * Providers component so the entire app shares one cache.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
