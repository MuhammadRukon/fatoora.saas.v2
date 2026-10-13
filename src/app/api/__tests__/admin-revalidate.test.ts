import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/server/common/errors';

const { revalidateCatalog, svc } = vi.hoisted(() => ({
  revalidateCatalog: vi.fn(),
  svc: {
    getProduct: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    createBrand: vi.fn(),
    updateBrand: vi.fn(),
    deleteBrand: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  },
}));

vi.mock('@/app/api/_lib/revalidate', () => ({ revalidateCatalog }));
vi.mock('@/server/catalog/catalog.service', () => ({ catalogService: svc }));
vi.mock('@/server/common/http', async () => {
  const { NextResponse } = await import('next/server');
  const { statusFromError } = await import('@/server/common/errors');
  return {
    requireAdminSession: async () => ({ id: 'admin' }),
    jsonError: (err: unknown) => NextResponse.json({}, { status: statusFromError(err) }),
  };
});

import { POST as postBrand } from '@/app/api/admin/catalog/brands/route';
import { DELETE as delBrand } from '@/app/api/admin/catalog/brands/[id]/route';
import { POST as postCategory } from '@/app/api/admin/catalog/categories/route';
import { PUT as putCategory } from '@/app/api/admin/catalog/categories/[id]/route';
import { POST as postProduct } from '@/app/api/admin/catalog/products/route';
import {
  DELETE as delProduct,
  PUT as putProduct,
} from '@/app/api/admin/catalog/products/[id]/route';

const variant = {
  name: 'V',
  sku: 'SKU-1',
  buyingPriceCents: 500,
  sellingPriceCents: 1000,
  discountCents: 0,
  stock: 1,
  lowStockThreshold: 1,
  isActive: true,
};
const productBody = {
  name: 'Phone',
  slug: 'bb',
  description: 'A phone',
  brandId: 'br1',
  categoryIds: ['c1'],
  warrantyMonths: 12,
  images: [],
  variants: [variant],
};
const req = (body: unknown) =>
  new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: 'p1' }) };

beforeEach(() => vi.clearAllMocks());

describe('admin catalog routes revalidate', () => {
  it('product PUT changing slug aa->bb passes productSlug bb and previousSlug aa', async () => {
    svc.getProduct.mockResolvedValue({ slug: 'aa' });
    svc.updateProduct.mockResolvedValue({ slug: 'bb' });
    const res = await putProduct(req(productBody), ctx);
    expect(res.status).toBe(200);
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
    expect(revalidateCatalog).toHaveBeenCalledWith({ productSlug: 'bb', previousSlug: 'aa' });
  });

  it('product POST passes the new slug', async () => {
    svc.createProduct.mockResolvedValue({ slug: 'bb' });
    await postProduct(req(productBody));
    expect(revalidateCatalog).toHaveBeenCalledWith({ productSlug: 'bb' });
  });

  it('product DELETE passes the slug read before deleting', async () => {
    svc.getProduct.mockResolvedValue({ slug: 'aa' });
    svc.deleteProduct.mockResolvedValue({ archived: false });
    await delProduct(req({}), ctx);
    expect(revalidateCatalog).toHaveBeenCalledWith({ productSlug: 'aa' });
  });

  it('brand and category writes revalidate the menu layout', async () => {
    svc.createBrand.mockResolvedValue({});
    svc.deleteBrand.mockResolvedValue(undefined);
    svc.createCategory.mockResolvedValue({});
    svc.updateCategory.mockResolvedValue({});
    await postBrand(req({ name: 'Acme', slug: 'acme' }));
    await delBrand(req({}), ctx);
    await postCategory(req({ name: 'Phones', slug: 'phones' }));
    await putCategory(req({ name: 'Phones', slug: 'phones' }), ctx);
    expect(revalidateCatalog).toHaveBeenCalledTimes(4);
    expect(revalidateCatalog).toHaveBeenCalledWith({ menu: true });
  });

  it('failing writes (409) never revalidate', async () => {
    const conflict = new ConflictError('dup');
    svc.getProduct.mockResolvedValue({ slug: 'aa' });
    svc.updateProduct.mockRejectedValue(conflict);
    svc.createProduct.mockRejectedValue(conflict);
    svc.deleteProduct.mockRejectedValue(conflict);
    svc.createBrand.mockRejectedValue(conflict);
    svc.updateCategory.mockRejectedValue(conflict);
    const res = await putProduct(req(productBody), ctx);
    expect(res.status).toBe(409);
    await postProduct(req(productBody));
    await delProduct(req({}), ctx);
    await postBrand(req({ name: 'Acme', slug: 'acme' }));
    await putCategory(req({ name: 'Phones', slug: 'phones' }), ctx);
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });
});
