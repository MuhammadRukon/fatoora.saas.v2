// Dependency-free: imported by next.config.ts (relative path) and re-exported from contracts/catalog.

/** Every query key the listing pages consume (productListQuerySchema keys; the filter UI and pagination write these same names). */
export const LISTING_FILTER_QUERY_KEYS = [
  'q',
  'brandSlug',
  'categorySlug',
  'minPrice',
  'maxPrice',
  'inStock',
  'sort',
  'page',
  'limit',
] as const;

export const LISTING_ROUTES = [
  { source: '/products', live: '/live/products' },
  { source: '/category/:slug', live: '/live/category/:slug' },
  { source: '/brand/:slug', live: '/live/brand/:slug' },
] as const;

/** One rule per route per key: default views stay ISR, any filter key rewrites to the dynamic twin (URL unchanged). */
export function buildListingRewrites() {
  return LISTING_ROUTES.flatMap(({ source, live }) =>
    LISTING_FILTER_QUERY_KEYS.map((key) => ({
      source,
      has: [{ type: 'query' as const, key }],
      destination: live,
    })),
  );
}
