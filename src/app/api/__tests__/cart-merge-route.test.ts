import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UnauthorizedError } from '@/server/common/errors';

const { cartService, session } = vi.hoisted(() => ({
  cartService: { mergeGuestCart: vi.fn() },
  session: { user: { id: 'u1' } as { id: string } | null },
}));

vi.mock('@/server/cart/cart.service', () => ({ cartService }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { statusFromError } = await import('@/server/common/errors');
  return {
    requireSession: async () => {
      if (!session.user) throw new UnauthorizedError();
      return session.user;
    },
    jsonError: (err: unknown) => NextResponse.json({}, { status: statusFromError(err) }),
  };
});

import { PUT } from '@/app/api/cart/route';

const req = () =>
  new Request('http://x', {
    method: 'PUT',
    body: JSON.stringify({ lines: [{ variantId: 'v1', quantity: 3 }] }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  session.user = { id: 'u1' };
});

describe('PUT /api/cart', () => {
  it('keeps the snapshot fields at the top level and adds adjustments', async () => {
    const result = {
      lines: [],
      subtotalCents: 0,
      itemCount: 0,
      adjustments: [{ variantId: 'v1', name: 'Phone', requested: 3, applied: 1 }],
    };
    cartService.mergeGuestCart.mockResolvedValue(result);

    const res = await PUT(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(cartService.mergeGuestCart).toHaveBeenCalledWith('u1', [
      { variantId: 'v1', quantity: 3 },
    ]);
  });

  it('returns 401 without a session and never merges', async () => {
    session.user = null;
    expect((await PUT(req())).status).toBe(401);
    expect(cartService.mergeGuestCart).not.toHaveBeenCalled();
  });
});
