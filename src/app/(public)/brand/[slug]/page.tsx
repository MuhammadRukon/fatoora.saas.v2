import { BrandListing, brandMetadata, publishedSlugs } from '@/app/components/listing-pages';

interface PageProps {
  params: Promise<{ slug: string }>;
}
export const revalidate = 60;

export const generateStaticParams = () => publishedSlugs('brand');

export async function generateMetadata({ params }: PageProps) {
  return brandMetadata((await params).slug);
}

export default async function BrandPage({ params }: Readonly<PageProps>) {
  return <BrandListing slug={(await params).slug} />;
}
