import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

const prisma = vi.hoisted(() => ({
  product: { findMany: vi.fn(), count: vi.fn() },
  category: { findMany: vi.fn() },
  brand: { findMany: vi.fn() },
}));
const repo = vi.hoisted(() => ({
  createBrand: vi.fn(),
  updateBrand: vi.fn(),
  deleteBrand: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('../catalog.repo', () => ({ catalogRepo: repo }));

import {
  __resetCacheStateForTests,
  buildKey,
  memoryStore,
  setStoreForTests,
} from '@/server/common/cache';
import { ConflictError } from '@/server/common/errors';
import { catalogService } from '../catalog.service';

const SHELL_KEY = buildKey('cat', 'shell', 'v1');
const KEY_RE = /^gw:[a-z]+:cat:((list|search):v1:[0-9a-f]{40}|shell:v1)$/;

const row = (i: number, name = `Phone ${i}`) => ({
  id: `p${i}`,
  createdAt: new Date(2024, 0, 1 + (i % 28)),
  slug: `phone-${i}`,
  name,
  description: 'an iphone clone',
  isPopular: false,
  brand: { id: 'b1', name: 'Apple', slug: 'apple' },
  images: [],
  variants: [{ sku: `SKU${i}`, sellingPriceCents: 1000, discountCents: 0, stock: 3 }],
  _count: { variants: 1 },
});

let store: ReturnType<typeof memoryStore>;
let get: Mock;
let set: Mock;
let del: Mock;

beforeEach(() => {
  vi.resetAllMocks();
  __resetCacheStateForTests();
  store = memoryStore();
  get = vi.spyOn(store, 'get') as unknown as Mock;
  set = vi.spyOn(store, 'set') as unknown as Mock;
  del = vi.spyOn(store, 'del') as unknown as Mock;
  setStoreForTests(store);
  prisma.product.findMany.mockResolvedValue([row(1), row(2)]);
  prisma.product.count.mockResolvedValue(2);
  prisma.category.findMany.mockResolvedValue([
    { id: 'c1', name: 'Phones', slug: 'phones', parentId: null, isPopular: true },
  ]);
  prisma.brand.findMany.mockResolvedValue([
    { id: 'b1', name: 'Apple', slug: 'apple', isPopular: true },
  ]);
});
afterEach(() => setStoreForTests(undefined));

describe('listPublicProducts cache', () => {
  it('identical calls hit the loader once and return equal results', async () => {
    const a = await catalogService.listPublicProducts({ brandSlug: 'apple', page: 1 });
    const b = await catalogService.listPublicProducts({ brandSlug: 'apple', page: 1 });
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('hit = 1 GET, 0 prisma; miss = 1 GET + 1 SET', async () => {
    await catalogService.listPublicProducts({ page: 1 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    get.mockClear();
    prisma.product.findMany.mockClear();
    prisma.product.count.mockClear();
    await catalogService.listPublicProducts({ page: 1 });
    expect(get).toHaveBeenCalledTimes(1);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.product.count).not.toHaveBeenCalled();
  });

  it('page 1 vs 2 are separate entries', async () => {
    await catalogService.listPublicProducts({ page: 1 });
    await catalogService.listPublicProducts({ page: 2 });
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });

  it('q is canonicalized: order, case, whitespace share one entry', async () => {
    await catalogService.listPublicProducts({ q: 'iphone', page: 1 });
    await catalogService.listPublicProducts({ page: 1, q: 'iphone' });
    await catalogService.listPublicProducts({ q: '  IPhone ' });
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
  });

  it('q search stores only the ranked page, not the candidate set', async () => {
    prisma.product.findMany.mockResolvedValue(
      Array.from({ length: 500 }, (_, i) => row(i, `iPhone ${i}`)),
    );
    const page = await catalogService.listPublicProducts({ q: 'iphone' });
    expect(page.total).toBe(500);
    const stored = set.mock.calls[0][1] as { items: unknown[] };
    expect(stored.items.length).toBeLessThanOrEqual(12);
  });

  it('ttl: 60s list, 120s search, 30s empty (jitter +/-10%)', async () => {
    const ttl = () => set.mock.calls.at(-1)![2] as number;
    await catalogService.listPublicProducts({ page: 1 });
    expect(ttl()).toBeGreaterThanOrEqual(54);
    expect(ttl()).toBeLessThanOrEqual(66);
    await catalogService.listPublicProducts({ q: 'iphone' });
    expect(ttl()).toBeGreaterThanOrEqual(108);
    expect(ttl()).toBeLessThanOrEqual(132);
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    await catalogService.listPublicProducts({ page: 9 });
    expect(ttl()).toBeGreaterThanOrEqual(27);
    expect(ttl()).toBeLessThanOrEqual(33);
  });

  it('keys match the documented shape', async () => {
    await catalogService.listPublicProducts({ page: 1 });
    await catalogService.listPublicProducts({ q: 'iphone' });
    await catalogService.getCatalogShell();
    const keys = set.mock.calls.map((c) => c[0] as string);
    expect(keys).toHaveLength(3);
    for (const k of keys) expect(k).toMatch(KEY_RE);
  });

  it('only queries PUBLISHED products, so drafts cannot enter a cached page', async () => {
    await catalogService.listPublicProducts({ page: 1 });
    await catalogService.listPublicProducts({ q: 'iphone' });
    expect(prisma.product.findMany.mock.calls.length).toBe(2);
    for (const [arg] of prisma.product.findMany.mock.calls) {
      expect(arg.where.status).toBe('PUBLISHED');
    }
  });

  it('an invalid query is not cached, just loaded', async () => {
    await catalogService.listPublicProducts({ page: 0 });
    await catalogService.listPublicProducts({ page: 0 });
    expect(set).not.toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('getCatalogShell', () => {
  it('second call adds no prisma calls', async () => {
    const a = await catalogService.getCatalogShell();
    const b = await catalogService.getCatalogShell();
    expect(b).toEqual(a);
    expect(prisma.category.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.brand.findMany).toHaveBeenCalledTimes(1);
    expect(a.categories[0].slug).toBe('phones');
    expect(a.brands[0].slug).toBe('apple');
  });
});

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
    meta: { target: ['slug'] },
  });
const brandIn = { name: 'Apple', slug: 'apple' } as never;
const catIn = { name: 'Phones', slug: 'phones' } as never;

describe('shell invalidation', () => {
  const cases: [string, () => Promise<unknown>, () => void][] = [
    [
      'createBrand',
      () => catalogService.createBrand(brandIn),
      () => repo.createBrand.mockRejectedValue(p2002()),
    ],
    [
      'updateBrand',
      () => catalogService.updateBrand('b1', brandIn),
      () => repo.updateBrand.mockRejectedValue(p2002()),
    ],
    [
      'deleteBrand',
      () => catalogService.deleteBrand('b1'),
      () => repo.deleteBrand.mockRejectedValue(p2002()),
    ],
    [
      'createCategory',
      () => catalogService.createCategory(catIn),
      () => repo.createCategory.mockRejectedValue(p2002()),
    ],
    [
      'updateCategory',
      () => catalogService.updateCategory('c1', catIn),
      () => repo.updateCategory.mockRejectedValue(p2002()),
    ],
    [
      'deleteCategory',
      () => catalogService.deleteCategory('c1'),
      () => repo.deleteCategory.mockRejectedValue(p2002()),
    ],
  ];
  it.each(cases)('%s deletes the shell key on success only', async (_n, run, fail) => {
    await run();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(SHELL_KEY);
    del.mockClear();
    fail();
    await expect(run()).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
  });

  it('P2002 on updateBrand is a ConflictError', async () => {
    repo.updateBrand.mockRejectedValue(p2002());
    await expect(catalogService.updateBrand('b1', brandIn)).rejects.toBeInstanceOf(ConflictError);
  });
});
