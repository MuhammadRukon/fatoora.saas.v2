import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch, ApiClientError } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import type { Brand, BrandInput, Category, CategoryInput, ProductInput } from '@/contracts/catalog';
import type { AdminUserCreateInput, AdminUserUpdateInput } from '@/contracts/admin-users';
import type { AdminProduct, AdminProductRow, AdminUser } from '@/server/catalog/catalog.repo';

const BRANDS_URL = '/api/admin/catalog/brands';
const CATEGORIES_URL = '/api/admin/catalog/categories';
const PRODUCTS_URL = '/api/admin/catalog/products';
const USERS_URL = '/api/admin/users';

function explainError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// --- Brands -----------------------------------------------------------------

export function useAdminBrands() {
  return useQuery({
    queryKey: queryKeys.brand,
    queryFn: () => apiFetch<{ items: Brand[] }>(BRANDS_URL).then((r) => r.items),
  });
}

export function useAdminBrandMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.brand });

  const create = useMutation({
    mutationFn: (input: BrandInput) =>
      apiFetch<{ brand: Brand }>(BRANDS_URL, { method: 'POST', body: input }),
    onSuccess: () => toast.success('Brand created'),
    onError: (err) => toast.error(explainError(err, 'Could not create brand')),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: BrandInput }) =>
      apiFetch<{ brand: Brand }>(`${BRANDS_URL}/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('Brand updated'),
    onError: (err) => toast.error(explainError(err, 'Could not update brand')),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${BRANDS_URL}/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Brand removed'),
    onError: (err) => toast.error(explainError(err, 'Could not remove brand')),
    onSettled: invalidate,
  });

  return { create, update, remove };
}

// --- Categories -------------------------------------------------------------

export function useAdminCategories() {
  return useQuery({
    queryKey: queryKeys.category,
    queryFn: () => apiFetch<{ items: Category[] }>(CATEGORIES_URL).then((r) => r.items),
  });
}

export function useAdminCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.category });

  const create = useMutation({
    mutationFn: (input: CategoryInput) =>
      apiFetch<{ category: Category }>(CATEGORIES_URL, { method: 'POST', body: input }),
    onSuccess: () => toast.success('Category created'),
    onError: (err) => toast.error(explainError(err, 'Could not create category')),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) =>
      apiFetch<{ category: Category }>(`${CATEGORIES_URL}/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('Category updated'),
    onError: (err) => toast.error(explainError(err, 'Could not update category')),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`${CATEGORIES_URL}/${id}`, { method: 'DELETE' }),
    onSuccess: () => toast.success('Category removed'),
    onError: (err) => toast.error(explainError(err, 'Could not remove category')),
    onSettled: invalidate,
  });

  return { create, update, remove };
}

// --- Products ---------------------------------------------------------------

export function useAdminProducts() {
  return useQuery({
    queryKey: queryKeys.product,
    queryFn: () => apiFetch<{ items: AdminProductRow[] }>(PRODUCTS_URL).then((r) => r.items),
  });
}

export function useAdminProduct(id: string | undefined) {
  return useQuery({
    queryKey: id ? [...queryKeys.product, id] : ['product-none'],
    enabled: !!id,
    queryFn: () =>
      apiFetch<{ product: AdminProduct }>(`${PRODUCTS_URL}/${id}`).then((r) => r.product),
  });
}

export function useAdminProductMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.product });

  const create = useMutation({
    mutationFn: (input: ProductInput) =>
      apiFetch<{ product: AdminProduct }>(PRODUCTS_URL, { method: 'POST', body: input }),
    onSuccess: () => toast.success('Product created'),
    onError: (err) => toast.error(explainError(err, 'Could not create product')),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductInput }) =>
      apiFetch<{ product: AdminProduct }>(`${PRODUCTS_URL}/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('Product updated'),
    onError: (err) => toast.error(explainError(err, 'Could not update product')),
    onSettled: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ archived: boolean }>(`${PRODUCTS_URL}/${id}`, { method: 'DELETE' }),
    onSuccess: (data) =>
      toast.success(data?.archived ? 'Product archived (referenced by orders)' : 'Product removed'),
    onError: (err) => toast.error(explainError(err, 'Could not remove product')),
    onSettled: invalidate,
  });

  return { create, update, remove };
}

// --- Users ---------------------------------------------------------------
export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: () => apiFetch<{ items: AdminUser[] }>(USERS_URL).then((r) => r.items),
  });
}

export function useAdminUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.user });

  const create = useMutation({
    mutationFn: (input: AdminUserCreateInput) =>
      apiFetch<{ user: AdminUser }>(USERS_URL, { method: 'POST', body: input }),
    onSuccess: () => toast.success('User created'),
    onError: (err) => toast.error(explainError(err, 'Could not create user')),
    onSettled: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUserUpdateInput }) =>
      apiFetch<{ user: AdminUser }>(`${USERS_URL}/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => toast.success('User updated'),
    onError: (err) => toast.error(explainError(err, 'Could not update user')),
    onSettled: invalidate,
  });

  return { create, update };
}
