import { ProductsListing, productsMetadata } from '@/app/components/listing-pages';
import { parseListingQuery, type ListingSearchParams } from '@/app/components/listing-query';

// Dynamic twin of /products: next.config rewrites filtered URLs here; the browser URL is unchanged.
interface PageProps {
  searchParams: Promise<ListingSearchParams>;
}

export async function generateMetadata({ searchParams }: Readonly<PageProps>) {
  return productsMetadata(await searchParams);
}

export default async function LiveProductsPage({ searchParams }: Readonly<PageProps>) {
  const query = parseListingQuery(await searchParams);
  return <ProductsListing query={query} />;
}
