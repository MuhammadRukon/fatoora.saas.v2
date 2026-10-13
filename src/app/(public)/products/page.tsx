import { ProductsListing, productsMetadata } from '@/app/components/listing-pages';

export const metadata = productsMetadata();
export const revalidate = 60;

export default function ProductsPage() {
  return <ProductsListing />;
}
