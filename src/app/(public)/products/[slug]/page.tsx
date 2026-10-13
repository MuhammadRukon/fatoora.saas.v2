import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { catalogService } from '@/server/catalog/catalog.service';
import { reviewsService } from '@/server/reviews/reviews.service';
import { AppError } from '@/server/common/errors';
import { ProductDetail } from '@/modules/storefront/components/product-detail';

interface PageProps {
  params: Promise<{ slug: string }>;
}
export const revalidate = 120;

// Empty list opts the route into on-demand ISR: pages are built on first hit, then cached.
export async function generateStaticParams() {
  return [];
}

const getProductBySlugCached = cache(async (slug: string) => {
  return catalogService.getPublicProductBySlug(slug);
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await getProductBySlugCached(slug);
    return {
      title: product.metaTitle ?? product.name,
      description: product.metaDescription ?? undefined,
      alternates: { canonical: `/products/${product.slug}` },
      openGraph: {
        title: product.metaTitle ?? product.name,
        description: product.metaDescription ?? undefined,
        images: product.images[0]?.url ? [{ url: product.images[0].url }] : [],
      },
    };
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      return { title: 'Product not found' };
    }
    throw err;
  }
}

export default async function ProductDetailPage({ params }: Readonly<PageProps>) {
  const { slug } = await params;
  let product;
  try {
    product = await getProductBySlugCached(slug);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }
  const [reviewSummary, initialReviews] = await Promise.all([
    reviewsService.summaryForProduct(product.id),
    reviewsService.listForProduct(product.id, 10),
  ]);
  return (
    <ProductDetail product={product} reviewSummary={reviewSummary} initialReviews={initialReviews} />
  );
}
