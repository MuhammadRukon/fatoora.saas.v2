import type { PublicReview, ReviewSummary } from '@/contracts/reviews';

import { RatingStars } from './rating-stars';
import { ReviewItem } from './review-item';
import { ShowAllReviews } from './show-all-reviews';

interface ReviewsSectionProps {
  productId: string;
  /** Server-rendered summary from the PDP; avoids a second summary query. */
  summary: ReviewSummary;
  /** Newest reviews rendered into the ISR HTML; the full list loads only on request. */
  initialReviews: PublicReview[];
}

export function ReviewsSection({ productId, summary, initialReviews }: ReviewsSectionProps) {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Customer reviews</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RatingStars value={summary.average} />
          <span>
            {summary.average.toFixed(1)} · {summary.count} review
            {summary.count === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {initialReviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No reviews yet. Be the first to share what you think after your delivery arrives.
        </p>
      ) : (
        <ul className="space-y-4">
          {initialReviews.map((r) => (
            <ReviewItem key={r.id} review={r} />
          ))}
        </ul>
      )}

      {summary.count > initialReviews.length ? (
        <ShowAllReviews productId={productId} initialReviews={initialReviews} />
      ) : null}
    </section>
  );
}
