import type { Metadata } from 'next';

import { productListQuerySchema } from '@/contracts/catalog';
import { LISTING_FILTER_QUERY_KEYS } from '@/lib/listing-rewrites';
import type { ProductListQuery } from '@/contracts/catalog';

export type ListingSearchParams = Record<string, string | string[] | undefined>;

/** Untrusted URL params must never 500 a page: invalid input renders the default list. */
export function parseListingQuery(searchParams: ListingSearchParams): ProductListQuery {
  const parsed = productListQuerySchema.safeParse(searchParams);
  return parsed.success ? parsed.data : {};
}

/** Live twins: noindex search results and direct /live access (no filter key); filtered views are indexable. */
export function liveRobots(searchParams: ListingSearchParams): Metadata {
  const q = searchParams.q;
  const hasQ = Array.isArray(q) ? q.some(Boolean) : !!q;
  const filtered = LISTING_FILTER_QUERY_KEYS.some((key) => searchParams[key] !== undefined);
  return hasQ || !filtered ? { robots: { index: false } } : {};
}
