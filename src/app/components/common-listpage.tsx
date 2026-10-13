import { Suspense } from 'react';

import { ProductGrid } from '@/modules/storefront/components/product-grid';
import { StorefrontPagination } from '@/modules/storefront/components/storefront-pagination';

import { ProductFilterWrapper } from '@/modules/storefront/components/product-filter-wrapper';
import { ProductFilters } from '@/modules/storefront/components/product-filters';

import type { IBrandOption, ICategoryOption } from '@/interfaces';

import type { PublicProductPage } from '@/contracts';

import { $Enums } from '@prisma/client';

import { env } from '@/env';
import {
  CustomBreadcrumb,
  buildBreadcrumbJsonLd,
  type BreadcrumbItem,
} from '@/app/components/breadcrumb/custom-breadcrumb';

interface Props {
  brands: IBrandOption[];

  categories: ICategoryOption[];

  brand?: {
    id: string;
    name: string;
    slug: string;
    status: $Enums.PublishStatus;
  };

  page: PublicProductPage;

  title: string;

  breadcrumbItems: BreadcrumbItem[];
}

export default function CommonListPage({
  brands,
  categories,
  brand,
  page,
  title,
  breadcrumbItems,
}: Readonly<Props>) {
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbItems, env.NEXT_PUBLIC_APP_URL);

  return (
    <ProductFilterWrapper
      filters={
        // useSearchParams in these two needs a narrow Suspense boundary on static routes,
        // otherwise the whole page bails out to client rendering and the HTML ships empty.
        <Suspense>
          <ProductFilters brands={brands} categories={categories} lockedBrandSlug={brand?.slug} />
        </Suspense>
      }
    >
      <section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
        <CustomBreadcrumb items={breadcrumbItems} />

        <h1 className="text-2xl font-semibold mb-4 mt-2">{title}</h1>

        <ProductGrid products={page.items} />

        <Suspense>
          <StorefrontPagination page={page.page} pageSize={page.pageSize} total={page.total} />
        </Suspense>
      </section>
    </ProductFilterWrapper>
  );
}
