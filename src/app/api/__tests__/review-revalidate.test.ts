import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, ValidationError } from '@/server/common/errors';

const { revalidateProductPage, reviews } = vi.hoisted(() => ({
  revalidateProductPage: vi.fn(),
  reviews: { submit: vi.fn(), productSlug: vi.fn() },
}));

vi.mock('@/app/api/_lib/revalidate', () => ({ revalidateProductPage }));
vi.mock('@/server/reviews/reviews.service', () => ({ reviewsService: reviews }));
vi.mock('@/server/common/rate-limit', () => ({ enforceRateLimit: vi.fn() }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { statusFromError } = await import('@/server/common/errors');
  return {
    requireSession: async () => ({ id: 'u1' }),
    jsonError: (err: unknown) => NextResponse.json({}, { status: statusFromError(err) }),
  };
});

import { POST } from '@/app/api/reviews/route';

const req = () =>
  new Request('http://x', {
    method: 'POST',
    body: JSON.stringify({ orderItemId: 'oi1', rating: 5, body: 'Great product' }),
  });

beforeEach(() => vi.clearAllMocks());

describe('POST /api/reviews revalidates the PDP', () => {
  it('calls the helper once with the product slug after a successful submit', async () => {
    reviews.submit.mockResolvedValue({ id: 'r1', productId: 'p1' });
    reviews.productSlug.mockResolvedValue('phone-x');
    expect((await POST(req())).status).toBe(201);
    expect(revalidateProductPage).toHaveBeenCalledTimes(1);
    expect(revalidateProductPage).toHaveBeenCalledWith('phone-x');
  });

  it('still returns 201 when the slug lookup fails after a saved review', async () => {
    reviews.submit.mockResolvedValue({ id: 'r1', productId: 'p1' });
    reviews.productSlug.mockRejectedValue(new Error('db down'));
    const res = await POST(req());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ review: { id: 'r1', productId: 'p1' } });
    expect(revalidateProductPage).not.toHaveBeenCalled();
  });

  it.each([new ConflictError('dup'), new ValidationError('bad')])(
    'does not call it when submit throws %s',
    async (err) => {
      reviews.submit.mockRejectedValue(err);
      await POST(req());
      expect(revalidateProductPage).not.toHaveBeenCalled();
    },
  );
});
