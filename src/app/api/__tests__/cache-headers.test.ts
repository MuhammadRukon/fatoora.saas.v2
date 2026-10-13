import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CATALOG_CACHE_CONTROL, REVIEWS_CACHE_CONTROL } from '@/app/api/_lib/cache-control';
import { NotFoundError } from '@/server/common/errors';

const { svc, reviews } = vi.hoisted(() => ({
  svc: {
    listPublicProducts: vi.fn(),
    getPublicProductBySlug: vi.fn(),
    listPublicBrands: vi.fn(),
    listPublicCategories: vi.fn(),
  },
  reviews: { listForProduct: vi.fn(), summaryForProduct: vi.fn() },
}));

vi.mock('@/server/catalog/catalog.service', () => ({ catalogService: svc }));
vi.mock('@/server/reviews/reviews.service', () => ({ reviewsService: reviews }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { statusFromError } = await import('@/server/common/errors');
  return {
    requireSession: vi.fn(),
    jsonError: (err: unknown) => NextResponse.json({}, { status: statusFromError(err) }),
  };
});

import { GET as brands } from '@/app/api/catalog/brands/route';
import { GET as categories } from '@/app/api/catalog/categories/route';
import { GET as products } from '@/app/api/catalog/products/route';
import { GET as product } from '@/app/api/catalog/products/[slug]/route';
import { GET as reviewList } from '@/app/api/reviews/route';

const slugCtx = { params: Promise.resolve({ slug: 's' }) };

beforeEach(() => {
  vi.clearAllMocks();
  svc.listPublicProducts.mockResolvedValue({ items: [] });
  svc.getPublicProductBySlug.mockResolvedValue({ id: 'p' });
  svc.listPublicBrands.mockResolvedValue([]);
  svc.listPublicCategories.mockResolvedValue([]);
  reviews.listForProduct.mockResolvedValue([]);
});

describe('public GET cache headers', () => {
  it('catalog 200s are cacheable at the CDN', async () => {
    const res = await products(new Request('http://x/api/catalog/products?limit=8'));
    expect(res.headers.get('Cache-Control')).toBe(CATALOG_CACHE_CONTROL);
    expect((await product(new Request('http://x'), slugCtx)).headers.get('Cache-Control')).toBe(
      CATALOG_CACHE_CONTROL,
    );
    expect((await brands()).headers.get('Cache-Control')).toBe(CATALOG_CACHE_CONTROL);
    expect((await categories()).headers.get('Cache-Control')).toBe(CATALOG_CACHE_CONTROL);
  });

  it('catalog errors are not cacheable', async () => {
    svc.getPublicProductBySlug.mockRejectedValue(new NotFoundError('Product'));
    const res = await product(new Request('http://x'), slugCtx);
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control') ?? '').not.toContain('public');
  });

  it('GET /api/reviews is cacheable for 10s and does not compute the summary', async () => {
    const res = await reviewList(new Request('http://x/api/reviews?productId=p'));
    expect(res.headers.get('Cache-Control')).toBe(REVIEWS_CACHE_CONTROL);
    expect(reviews.summaryForProduct).not.toHaveBeenCalled();
  });
});
