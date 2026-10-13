// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PublicReview } from '@/contracts/reviews';

const hook = vi.hoisted(() => ({ items: [] as PublicReview[] }));
vi.mock('@/modules/reviews/hooks', () => ({
  useProductReviews: () => ({ data: { items: hook.items }, isFetching: false, isError: false }),
}));
vi.mock('../components/review-item', () => ({
  ReviewItem: ({ review }: { review: PublicReview }) => <li>{review.id}</li>,
}));

import { ShowAllReviews } from '../components/show-all-reviews';

const review = (id: string): PublicReview => ({
  id,
  rating: 5,
  title: null,
  body: 'Great product',
  authorName: 'Jane D.',
  createdAt: '2026-01-02T03:04:05.000Z',
});

afterEach(cleanup);

describe('ShowAllReviews', () => {
  it('does not render cached extra reviews before the click (back-navigation within the cache lifetime)', () => {
    hook.items = [review('a'), review('b'), review('c')];
    render(<ShowAllReviews productId="p1" initialReviews={[review('a'), review('b')]} />);
    expect(screen.queryByText('c')).toBeNull();
    expect(screen.getByText('Show all reviews')).toBeTruthy();

    fireEvent.click(screen.getByText('Show all reviews'));
    expect(screen.getByText('c')).toBeTruthy();
    expect(screen.queryByText('Show all reviews')).toBeNull();
  });
});
