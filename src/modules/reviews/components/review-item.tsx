import type { PublicReview } from '@/contracts/reviews';

import { RatingStars } from './rating-stars';

export function ReviewItem({ review: r }: { review: PublicReview }) {
  return (
    <li className="rounded border p-4">
      <div className="flex items-center gap-2">
        <RatingStars value={r.rating} />
        <span className="text-xs text-muted-foreground">
          {/* UTC + fixed locale: identical in cached HTML and in the client island. */}
          by {r.authorName} ·{' '}
          {new Date(r.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}
        </span>
      </div>
      {r.title ? <p className="mt-1 font-medium">{r.title}</p> : null}
      <p className="mt-1 text-sm whitespace-pre-line">{r.body}</p>
    </li>
  );
}
