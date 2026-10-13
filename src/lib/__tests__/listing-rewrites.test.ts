import { describe, expect, it } from 'vitest';

import { productListQuerySchema } from '@/contracts/catalog';
import { buildListingRewrites, LISTING_FILTER_QUERY_KEYS, LISTING_ROUTES } from '@/lib/listing-rewrites';

// Keys intentionally NOT routed to the dynamic twin. Empty: even `limit` changes results.
const IGNORED_SCHEMA_KEYS: string[] = [];
// Keys the filter UI writes into the URL besides schema keys (pagination/filters use schema names).
const EXTRA_UI_KEYS: string[] = [];

describe('listing rewrites', () => {
  it('covers every productListQuerySchema key (or an explicit ignore)', () => {
    for (const key of Object.keys(productListQuerySchema.shape)) {
      expect(
        LISTING_FILTER_QUERY_KEYS.includes(key as never) || IGNORED_SCHEMA_KEYS.includes(key),
        `schema key "${key}" missing from LISTING_FILTER_QUERY_KEYS`,
      ).toBe(true);
    }
    for (const key of EXTRA_UI_KEYS) expect(LISTING_FILTER_QUERY_KEYS).toContain(key);
  });

  it('has exactly one query-has rule per key per listing route', () => {
    const rules = buildListingRewrites();
    expect(LISTING_ROUTES).toHaveLength(3);
    expect(rules).toHaveLength(LISTING_ROUTES.length * LISTING_FILTER_QUERY_KEYS.length);
    for (const { source, live } of LISTING_ROUTES) {
      for (const key of LISTING_FILTER_QUERY_KEYS) {
        const matches = rules.filter((r) => r.source === source && r.has[0].key === key);
        expect(matches).toHaveLength(1);
        expect(matches[0].has).toEqual([{ type: 'query', key }]);
        expect(matches[0].destination).toBe(live);
      }
    }
  });

  it('does not route tracking params', () => {
    const keys = buildListingRewrites().map((r) => r.has[0].key);
    for (const k of ['utm_source', 'fbclid', 'gclid']) expect(keys).not.toContain(k);
  });

  it('maps to the live twin paths', () => {
    expect(LISTING_ROUTES.map((r) => r.live).sort()).toEqual([
      '/live/brand/:slug',
      '/live/category/:slug',
      '/live/products',
    ]);
  });
});
