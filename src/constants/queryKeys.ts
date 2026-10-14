/**
 * Centralized React Query keys. Keeping them in one place avoids
 * subtle cache misses caused by tuple/string drift between hooks.
 */
export const queryKeys = {
  user: ['user'] as const,
  subscriptionState: ['subscription', 'me'] as const,
  business: ['business', 'me'] as const,
  customers: {
    all: ['customers'] as const,
    list: (q: string) => ['customers', 'list', q] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
};
