import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicReview } from '@/contracts/reviews';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/fetcher', () => ({ apiFetch }));
vi.mock('sonner', () => ({ toast: {} }));

import { productReviewsQuery } from '../hooks';

const review = (id: string): PublicReview => ({
  id,
  rating: 5,
  title: null,
  body: 'Great product',
  authorName: 'Jane D.',
  createdAt: '2026-01-02T03:04:05.000Z',
});
const initial = [review('a'), review('b')];
const full = [review('a'), review('b'), review('c')];

beforeEach(() => apiFetch.mockReset());

describe('productReviewsQuery', () => {
  it('serves the SSR items and fetches nothing while disabled', async () => {
    const qc = new QueryClient();
    const obs = new QueryObserver(qc, productReviewsQuery('p1', { initialItems: initial, enabled: false }));
    const unsub = obs.subscribe(() => {});
    expect(obs.getCurrentResult().data?.items).toEqual(initial);
    expect(apiFetch).not.toHaveBeenCalled();
    unsub();
  });

  it('issues exactly one GET when enabled, even with fresh-looking SSR data', async () => {
    apiFetch.mockResolvedValue({ items: full });
    const qc = new QueryClient();
    const opts = productReviewsQuery('p1', { initialItems: initial, enabled: true });
    const obs = new QueryObserver(qc, opts);
    const unsub = obs.subscribe(() => {});
    await vi.waitFor(() => expect(obs.getCurrentResult().data?.items).toEqual(full));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/api/reviews?productId=p1');
    unsub();
  });
});
