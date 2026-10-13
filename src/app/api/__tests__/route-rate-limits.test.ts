import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  user: { id: 'u1' },
  cart: { hydrateGuestCart: vi.fn() },
  catalog: { listPublicProducts: vi.fn() },
  checkout: { quote: vi.fn() },
  reviews: { submit: vi.fn() },
  warranty: { submit: vi.fn() },
}));

// Any DB use means a route fell back to Postgres: fail loudly.
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, { get: () => { throw new Error('unexpected prisma use'); } }),
}));
vi.mock('@/server/cart/cart.service', () => ({ cartService: m.cart }));
vi.mock('@/server/catalog/catalog.service', () => ({ catalogService: m.catalog }));
vi.mock('@/server/checkout/checkout.service', () => ({ checkoutService: m.checkout }));
vi.mock('@/server/reviews/reviews.service', () => ({ reviewsService: m.reviews }));
vi.mock('@/server/warranty/warranty.service', () => ({ warrantyService: m.warranty }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { RateLimitedError } = await import('@/server/common/rate-limit');
  return {
    requireSession: async () => m.user,
    jsonError: (err: unknown) =>
      err instanceof RateLimitedError
        ? NextResponse.json({}, { status: 429, headers: { 'Retry-After': String(err.retryAfter) } })
        : NextResponse.json({ message: String(err) }, { status: 500 }),
  };
});

import { POST as hydrate } from '@/app/api/cart/hydrate/route';
import { GET as products } from '@/app/api/catalog/products/route';
import { POST as quote } from '@/app/api/checkout/quote/route';
import { POST as review } from '@/app/api/reviews/route';
import { POST as warranty } from '@/app/api/orders/[id]/warranty/route';
import { __resetCacheStateForTests, memoryStore, setStoreForTests } from '@/server/common/cache';
import { __memoryWindowsForTests } from '@/server/common/rate-limit';

const post = (url: string, body: unknown, ip = '1.1.1.1') =>
  new Request(`http://t${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'x-forwarded-for': `${ip}, 10.0.0.1`, 'content-type': 'application/json' },
  });
const get = (url: string, ip = '1.1.1.1') =>
  new Request(`http://t${url}`, { headers: { 'x-forwarded-for': ip } });

let incr: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  __resetCacheStateForTests();
  __memoryWindowsForTests.clear();
  const store = memoryStore();
  incr = vi.fn(store.incrWindow);
  setStoreForTests({ ...store, incrWindow: incr });
  m.user = { id: 'u1' };
  m.cart.hydrateGuestCart.mockResolvedValue({ items: [] });
  m.catalog.listPublicProducts.mockResolvedValue({ items: [] });
  m.checkout.quote.mockResolvedValue({});
  m.reviews.submit.mockResolvedValue({});
  m.warranty.submit.mockResolvedValue({});
});

describe('hot public endpoints', () => {
  it('hydrate: 121st call/min per IP is 429 with Retry-After; other IP fine', async () => {
    const body = { lines: [] };
    for (let i = 0; i < 120; i++) expect((await hydrate(post('/api/cart/hydrate', body))).status).toBe(200);
    const res = await hydrate(post('/api/cart/hydrate', body));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await hydrate(post('/api/cart/hydrate', body, '2.2.2.2'))).status).toBe(200);
  });

  it('catalog: 121st q search/min per IP is 429; no-q never touches the limiter', async () => {
    for (let i = 0; i < 120; i++) expect((await products(get('/api/catalog/products?q=abc'))).status).toBe(200);
    expect((await products(get('/api/catalog/products?q=abc'))).status).toBe(429);
    expect((await products(get('/api/catalog/products?q=abc', '2.2.2.2'))).status).toBe(200);

    incr.mockClear();
    for (let i = 0; i < 200; i++) expect((await products(get('/api/catalog/products?limit=8'))).status).toBe(200);
    expect((await products(get('/api/catalog/products?q='))).status).toBe(200);
    expect(incr).not.toHaveBeenCalled();
  });

  it('hot endpoints use the in-memory window without Postgres when Redis is absent', async () => {
    setStoreForTests(null);
    for (let i = 0; i < 120; i++) expect((await products(get('/api/catalog/products?q=abc'))).status).toBe(200);
    expect((await products(get('/api/catalog/products?q=abc'))).status).toBe(429);
    for (let i = 0; i < 120; i++) expect((await hydrate(post('/api/cart/hydrate', { lines: [] }))).status).toBe(200);
    expect((await hydrate(post('/api/cart/hydrate', { lines: [] }))).status).toBe(429);
  });
});

describe('authenticated endpoints', () => {
  it('quote: 31st call/min per user is 429; other user fine', async () => {
    const b = { addressId: 'a' };
    for (let i = 0; i < 30; i++) expect((await quote(post('/api/checkout/quote', b))).status).toBe(200);
    expect((await quote(post('/api/checkout/quote', b))).status).toBe(429);
    expect(m.checkout.quote).toHaveBeenCalledTimes(30);
    m.user = { id: 'u2' };
    expect((await quote(post('/api/checkout/quote', b))).status).toBe(200);
  });

  it('review: 11th POST/hour per user is 429', async () => {
    const b = { orderItemId: 'oi', rating: 5, body: 'great product indeed' };
    m.reviews.submit.mockResolvedValue({});
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await review(post('/api/reviews', b))).status;
    expect(last).toBe(429);
    expect(m.reviews.submit).toHaveBeenCalledTimes(10);
  });

  it('warranty: 6th POST/hour per user is 429', async () => {
    const ctx = { params: Promise.resolve({ id: 'o1' }) };
    const b = { reason: 'screen stopped working properly' };
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await warranty(post('/api/orders/o1/warranty', b), ctx)).status;
    expect(last).toBe(429);
    expect(m.warranty.submit).toHaveBeenCalledTimes(5);
  });
});
