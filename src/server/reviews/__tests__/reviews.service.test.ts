import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { review: { findMany } } }));

import { reviewsService } from '../reviews.service';

const row = (name: string | null, id = 'r1') => ({
  id,
  rating: 5,
  title: null,
  body: 'Great product',
  createdAt: new Date('2026-01-02T03:04:05Z'),
  user: { id: 'u1', name },
});

beforeEach(() => findMany.mockReset());

describe('reviewsService.listForProduct', () => {
  it('limits to the requested take, newest first', async () => {
    findMany.mockResolvedValue([]);
    await reviewsService.listForProduct('p1', 10);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p1' }, orderBy: { createdAt: 'desc' }, take: 10 }),
    );
  });

  it('defaults to 50', async () => {
    findMany.mockResolvedValue([]);
    await reviewsService.listForProduct('p1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
  });

  it.each([
    ['Jane Doe', 'Jane D.'],
    ['Jane Marie doe', 'Jane D.'],
    ['  Jane   Doe  ', 'Jane D.'],
    ['Jane', 'Jane'],
    ['', 'Verified buyer'],
    ['   ', 'Verified buyer'],
    [null, 'Verified buyer'],
  ])('shows %j as %j, never the full name', async (name, expected) => {
    findMany.mockResolvedValue([row(name)]);
    const [review] = await reviewsService.listForProduct('p1');
    expect(review.authorName).toBe(expected);
  });
});
