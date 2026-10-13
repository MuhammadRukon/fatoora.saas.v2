import { CategoryListing, categoryMetadata } from '@/app/components/listing-pages';
import { parseListingQuery, type ListingSearchParams } from '@/app/components/listing-query';

// Dynamic twin of /category/[slug]: next.config rewrites filtered URLs here; the browser URL is unchanged.
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<ListingSearchParams>;
}

export async function generateMetadata({ params, searchParams }: Readonly<PageProps>) {
  return categoryMetadata((await params).slug, await searchParams);
}

export default async function LiveCategoryPage({ params, searchParams }: Readonly<PageProps>) {
  const query = parseListingQuery(await searchParams);
  return <CategoryListing slug={(await params).slug} query={query} />;
}
