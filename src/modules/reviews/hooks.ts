'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/fetcher';
import type {
  PublicReview,
  ReviewInput,
  ReviewableItem,
} from '@/contracts/reviews';

interface ProductReviewsOptions {
  /** First reviews rendered by the server; shown until the full list is requested. */
  initialItems?: PublicReview[];
  enabled?: boolean;
}

export function productReviewsQuery(
  productId: string | null,
  { initialItems, enabled = true }: ProductReviewsOptions = {},
) {
  return queryOptions({
    queryKey: ['reviews', 'product', productId],
    queryFn: () =>
      apiFetch<{ items: PublicReview[] }>(
        `/api/reviews?productId=${productId}`,
      ),
    enabled: !!productId && enabled,
    staleTime: 60_000,
    // Epoch 0 marks the SSR items stale so enabling the query still fetches the full list.
    ...(initialItems && { initialData: { items: initialItems }, initialDataUpdatedAt: 0 }),
  });
}

export function useProductReviews(productId: string | null, options?: ProductReviewsOptions) {
  return useQuery(productReviewsQuery(productId, options));
}

export function useReviewableItems() {
  return useQuery({
    queryKey: ['reviews', 'reviewable'],
    queryFn: () => apiFetch<{ items: ReviewableItem[] }>('/api/reviews/reviewable').then((r) => r.items),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) =>
      apiFetch<{ review: { id: string } }>('/api/reviews', { method: 'POST', body: input }),
    onSuccess: () => {
      toast.success('Review submitted');
      qc.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'Could not submit review'),
  });
}
