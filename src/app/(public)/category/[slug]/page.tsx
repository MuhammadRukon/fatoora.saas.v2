import { CategoryListing, categoryMetadata, publishedSlugs } from '@/app/components/listing-pages';

interface PageProps {
  params: Promise<{ slug: string }>;
}
export const revalidate = 60;

export const generateStaticParams = () => publishedSlugs('category');

export async function generateMetadata({ params }: PageProps) {
  return categoryMetadata((await params).slug);
}

export default async function CategoryPage({ params }: Readonly<PageProps>) {
  return <CategoryListing slug={(await params).slug} />;
}
