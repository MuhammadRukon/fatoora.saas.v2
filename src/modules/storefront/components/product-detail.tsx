import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import type { PublicProductDetail } from '@/contracts/catalog';
import type { PublicReview, ReviewSummary } from '@/contracts/reviews';
import { env } from '@/env';
import { ProductDetailGallery } from '@/modules/storefront/components/product-detail-gallery';
import { ProductDetailPurchasePanel } from '@/modules/storefront/components/product-detail-purchase-panel';
import { ReviewsSection } from '@/modules/reviews/components/reviews-section';
import {
  CustomBreadcrumb,
  buildBreadcrumbJsonLd,
} from '@/app/components/breadcrumb/custom-breadcrumb';

interface ProductDetailProps {
  product: PublicProductDetail;
  reviewSummary: ReviewSummary;
  initialReviews: PublicReview[];
}

export function ProductDetail({
  product,
  reviewSummary,
  initialReviews,
}: Readonly<ProductDetailProps>) {
  const initialVariant = product.variants.find((v) => v.inStock) ?? product.variants[0] ?? null;
  const ldJson = buildJsonLd(product, initialVariant, reviewSummary);
  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: product.brand.name, href: `/brand/${product.brand.slug}` },
    { label: product.name },
  ];
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems, env.NEXT_PUBLIC_APP_URL);

  return (
    <article className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="md:col-span-2">
        <CustomBreadcrumb items={breadcrumbItems} />
      </div>

      <section>
        <ProductDetailGallery productName={product.name} images={product.images} />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            <Link
              className="underline-offset-2 hover:underline"
              href={`/brand/${product.brand.slug}`}
            >
              {product.brand.name}
            </Link>
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold">{product.name}</h1>
        </div>

        <ProductDetailPurchasePanel
          variants={product.variants}
          warrantyMonths={product.warrantyMonths}
        />

        <Card>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none p-4 whitespace-pre-line">
            {product.description}
          </CardContent>
        </Card>

        {product.categories.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Categories:{' '}
            {product.categories.map((c, idx) => (
              <span key={c.id}>
                <Link href={`/category/${c.slug}`} className="underline-offset-2 hover:underline">
                  {c.name}
                </Link>
                {idx < product.categories.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        ) : null}
      </section>

      <section className="md:col-span-2 mt-6">
        <ReviewsSection
          productId={product.id}
          summary={reviewSummary}
          initialReviews={initialReviews}
        />
      </section>
    </article>
  );
}

function buildJsonLd(
  product: PublicProductDetail,
  variant: PublicProductDetail['variants'][number] | null,
  reviewSummary: ReviewSummary,
) {
  const offers = variant
    ? {
        '@type': 'Offer',
        priceCurrency: 'BDT',
        price: (variant.priceCents / 100).toFixed(2),
        availability: variant.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        sku: variant.sku,
      }
    : undefined;
  // aggregateRating requires Google's minimum of 1 rating; omit entirely
  // when there are none rather than emitting a misleading 0-star block.
  const aggregateRating =
    reviewSummary.count > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: reviewSummary.average.toFixed(1),
          reviewCount: reviewSummary.count,
        }
      : undefined;
  return {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images.map((i) => i.url),
    brand: { '@type': 'Brand', name: product.brand.name },
    sku: variant?.sku,
    offers,
    aggregateRating,
  };
}
