'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { PublicReview } from '@/contracts/reviews';
import { useProductReviews } from '@/modules/reviews/hooks';

import { ReviewItem } from './review-item';

/** Client island: fetches the full list only after the click and appends what the server list lacks. */
export function ShowAllReviews({
  productId,
  initialReviews,
}: {
  productId: string;
  initialReviews: PublicReview[];
}) {
  const [open, setOpen] = useState(false);
  const { data, isFetching, isError } = useProductReviews(productId, {
    initialItems: initialReviews,
    enabled: open,
  });

  const shown = new Set(initialReviews.map((r) => r.id));
  // Only after the click: a disabled query can still hold cached items from an earlier visit.
  const more = open ? (data?.items ?? []).filter((r) => !shown.has(r.id)) : [];

  return (
    <>
      {more.length > 0 ? (
        <ul className="space-y-4">
          {more.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </ul>
      ) : null}
      {isError ? <p className="text-sm text-destructive">Could not load more reviews.</p> : null}
      {open ? null : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Show all reviews
        </Button>
      )}
      {isFetching ? <p className="text-sm text-muted-foreground">Loading reviews...</p> : null}
    </>
  );
}
