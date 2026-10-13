import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import CommonListPage from '@/app/components/common-listpage';
import { liveRobots, type ListingSearchParams } from '@/app/components/listing-query';
import type { ProductListQuery } from '@/contracts/catalog';
import { prisma } from '@/lib/prisma';
import { catalogService } from '@/server/catalog/catalog.service';
import { log } from '@/server/common/logger';

/**
 * Shared bodies for the default (ISR) listing routes and their dynamic `/live/*` twins.
 * The ISR routes pass an empty query; the twins pass the parsed searchParams.
 */

const getCategoryBySlug = cache((slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true },
  }),
);

const getBrandBySlug = cache((slug: string) =>
  prisma.brand.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, status: true },
  }),
);

export function productsMetadata(live?: ListingSearchParams): Metadata {
  return {
    title: 'All products',
    description: 'Browse all gadgets and electronics in the catalog.',
    alternates: { canonical: '/products' },
    ...(live && liveRobots(live)),
  };
}

export async function categoryMetadata(slug: string, live?: ListingSearchParams): Promise<Metadata> {
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: 'Category not found' };
  return {
    title: cat.name ?? '',
    description: `Browse all ${cat.name ?? ''} products in our catalog.`,
    alternates: { canonical: `/category/${cat.slug}` },
    ...(live && liveRobots(live)),
  };
}

export async function brandMetadata(slug: string, live?: ListingSearchParams): Promise<Metadata> {
  const brand = await getBrandBySlug(slug);
  if (!brand) return { title: 'Brand not found' };
  return {
    title: brand.name ?? '',
    description: `Browse all ${brand.name} products.`,
    alternates: { canonical: `/brand/${brand.slug}` },
    ...(live && liveRobots(live)),
  };
}

// Build must not crash without DB access: unlisted slugs still render on demand and get cached.
export async function publishedSlugs(kind: 'category' | 'brand'): Promise<{ slug: string }[]> {
  try {
    const rows =
      kind === 'category'
        ? await catalogService.listPublicCategories()
        : await catalogService.listPublicBrands();
    return rows.map(({ slug }) => ({ slug }));
  } catch (err) {
    log.warn('publishedSlugs failed', { kind, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function loadLists(query: ProductListQuery) {
  const [page, { brands, categories }] = await Promise.all([
    catalogService.listPublicProducts(query),
    catalogService.getCatalogShell(),
  ]);
  return [page, brands, categories] as const;
}

export async function ProductsListing({ query = {} }: Readonly<{ query?: ProductListQuery }>) {
  const [page, brands, categories] = await loadLists(query);
  return (
    <CommonListPage
      brands={brands}
      categories={categories}
      page={page}
      title="All products"
      breadcrumbItems={[{ label: 'Home', href: '/' }, { label: 'All products' }]}
    />
  );
}

export async function CategoryListing({
  slug,
  query = {},
}: Readonly<{ slug: string; query?: ProductListQuery }>) {
  const [category, [page, brands, categories]] = await Promise.all([
    getCategoryBySlug(slug),
    loadLists({ ...query, categorySlug: slug }),
  ]);
  if (category?.status !== 'PUBLISHED') notFound();
  return (
    <CommonListPage
      brands={brands}
      categories={categories}
      brand={category}
      page={page}
      title={category.name}
      breadcrumbItems={[{ label: 'Home', href: '/' }, { label: category.name }]}
    />
  );
}

export async function BrandListing({
  slug,
  query = {},
}: Readonly<{ slug: string; query?: ProductListQuery }>) {
  const [brand, [page, brands, categories]] = await Promise.all([
    getBrandBySlug(slug),
    loadLists({ ...query, brandSlug: slug }),
  ]);
  if (brand?.status !== 'PUBLISHED') notFound();
  return (
    <CommonListPage
      brands={brands}
      categories={categories}
      brand={brand}
      page={page}
      title={brand.name}
      breadcrumbItems={[{ label: 'Home', href: '/' }, { label: brand.name }]}
    />
  );
}
