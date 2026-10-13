import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  productVariant: { findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma }));

import { cartService } from '@/server/cart/cart.service';
import {
  __resetCacheStateForTests,
  buildKey,
  memoryStore,
  setDefer,
  setStoreForTests,
  type CacheStore,
} from '@/server/common/cache';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Variant ${id}`,
  sku: `SKU-${id}`,
  stock: 10,
  isActive: true,
  sellingPriceCents: 10000,
  discountCents: 1000,
  product: {
    id: `p-${id}`,
    slug: `slug-${id}`,
    name: `Product ${id}`,
    status: 'PUBLISHED',
    images: [{ url: `https://img/${id}.jpg` }],
  },
  ...over,
});

const DB: Record<string, ReturnType<typeof row>> = { A: row('A'), B: row('B'), C: row('C') };

beforeEach(() => {
  vi.resetAllMocks();
  __resetCacheStateForTests();
  prisma.productVariant.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    where.id.in.map((id) => DB[id]).filter(Boolean),
  );
});
afterEach(() => {
  setStoreForTests(undefined);
  setDefer(undefined);
});

const g = (variantId: string, quantity: number) => ({ variantId, quantity });

describe('hydrateGuestCart with a store', () => {
  it('hits the DB once for 3 variants hydrated twice; quantities come from the request', async () => {
    setStoreForTests(memoryStore());
    const first = await cartService.hydrateGuestCart([g('A', 1), g('B', 2), g('C', 3)]);
    const second = await cartService.hydrateGuestCart([g('A', 4), g('B', 5), g('C', 6)]);
    expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(second.lines.map((l) => l.quantity)).toEqual([4, 5, 6]);
    expect(second.itemCount).toBe(15);
    expect(second.subtotalCents).toBe(9000 * 15);
    expect(first.lines.map((l) => ({ ...l, quantity: 0 }))).toEqual(
      second.lines.map((l) => ({ ...l, quantity: 0 })),
    );
  });

  it('queries only the missing ids on a partial hit', async () => {
    setStoreForTests(memoryStore());
    await cartService.hydrateGuestCart([g('A', 1), g('B', 1)]);
    prisma.productVariant.findMany.mockClear();
    const out = await cartService.hydrateGuestCart([g('B', 2), g('C', 1)]);
    expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.findMany.mock.calls[0][0].where.id.in).toEqual(['C']);
    expect(out.lines.map((l) => l.variantId)).toEqual(['B', 'C']); // guest order kept
  });

  it('stores a display DTO with no quantity or user data, ttl 30s', async () => {
    const store = memoryStore();
    const setSpy = vi.spyOn(store, 'set');
    setStoreForTests(store);
    await cartService.hydrateGuestCart([g('A', 7)]);
    expect(setSpy).toHaveBeenCalledTimes(1);
    const [key, dto, ttl] = setSpy.mock.calls[0];
    expect(key).toBe(buildKey('var', 'v1', 'A'));
    expect(ttl).toBe(30);
    expect(Object.keys(dto as object).sort()).toEqual(
      [
        'discountCents',
        'imageUrl',
        'isActive',
        'productId',
        'productName',
        'productSlug',
        'sellingPriceCents',
        'sku',
        'stock',
        'variantId',
        'variantName',
      ].sort(),
    );
  });

  it('omits unknown variants without throwing', async () => {
    setStoreForTests(memoryStore());
    const out = await cartService.hydrateGuestCart([g('A', 1), g('NOPE', 2), g('B', 1)]);
    expect(out.lines.map((l) => l.variantId)).toEqual(['A', 'B']);
    expect(out.itemCount).toBe(2);
  });

  it('computes isActive at store time (inactive variant / unpublished product)', async () => {
    DB.X = row('X', { isActive: false });
    DB.Y = row('Y', { product: { ...row('Y').product, status: 'DRAFT' } });
    setStoreForTests(memoryStore());
    const out = await cartService.hydrateGuestCart([g('X', 1), g('Y', 1)]);
    expect(out.lines.map((l) => l.isActive)).toEqual([false, false]);
    const again = await cartService.hydrateGuestCart([g('X', 1), g('Y', 1)]);
    expect(again.lines.map((l) => l.isActive)).toEqual([false, false]);
    delete DB.X;
    delete DB.Y;
  });

  it('falls back to the DB when the store rejects', async () => {
    const broken: CacheStore = {
      ...memoryStore(),
      mget: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
    };
    setStoreForTests(broken);
    const out = await cartService.hydrateGuestCart([g('A', 2), g('B', 1)]);
    expect(prisma.productVariant.findMany.mock.calls[0][0].where.id.in).toEqual(['A', 'B']);
    expect(out.lines.map((l) => l.variantId)).toEqual(['A', 'B']);
    expect(out.itemCount).toBe(3);
  });
});

describe('hydrateGuestCart with a deferred scheduler', () => {
  it('returns without waiting for the Redis SETs, which run when the task is invoked', async () => {
    const store = memoryStore();
    const set = vi.spyOn(store, 'set').mockImplementation(() => new Promise(() => {}));
    setStoreForTests(store);
    const tasks: Array<() => Promise<unknown>> = [];
    setDefer((task) => void tasks.push(task));
    const out = await cartService.hydrateGuestCart([g('A', 1), g('B', 1)]);
    expect(out.lines.map((l) => l.variantId)).toEqual(['A', 'B']);
    expect(set).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    void tasks[0]();
    expect(set).toHaveBeenCalledTimes(2);
  });
});

describe('hydrateGuestCart without a store', () => {
  it('runs one findMany for all ids and returns the exact previous output', async () => {
    setStoreForTests(null);
    const out = await cartService.hydrateGuestCart([g('A', 2), g('C', 1)]);
    expect(prisma.productVariant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.productVariant.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['A', 'C'] } });
    expect(out).toEqual({
      lines: [
        {
          itemId: 'A',
          variantId: 'A',
          productId: 'p-A',
          productSlug: 'slug-A',
          productName: 'Product A',
          variantName: 'Variant A',
          sku: 'SKU-A',
          imageUrl: 'https://img/A.jpg',
          unitPriceCents: 9000,
          originalUnitPriceCents: 10000,
          quantity: 2,
          stock: 10,
          isActive: true,
        },
        {
          itemId: 'C',
          variantId: 'C',
          productId: 'p-C',
          productSlug: 'slug-C',
          productName: 'Product C',
          variantName: 'Variant C',
          sku: 'SKU-C',
          imageUrl: 'https://img/C.jpg',
          unitPriceCents: 9000,
          originalUnitPriceCents: 10000,
          quantity: 1,
          stock: 10,
          isActive: true,
        },
      ],
      subtotalCents: 27000,
      itemCount: 3,
    });
  });
});
