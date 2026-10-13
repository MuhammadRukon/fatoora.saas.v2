import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { catalogService } from '@/server/catalog/catalog.service';
import { ProductGrid } from '@/modules/storefront/components/product-grid';

export const metadata = {
  title: 'Cryptech - gadgets & electronics',
  description: 'Discover the latest gadgets, laptops, phones and accessories.',
  alternates: { canonical: '/' },
};

export const revalidate = 120;

export default async function HomePage() {
  const featured = await catalogService.listPublicProducts({ sort: 'newest', limit: 8 });

  return (
    <div className="space-y-10 py-6">
      <h1 className="sr-only">Cryptech — gadgets &amp; electronics in Bangladesh</h1>
      <Image
        className="w-full max-h-96 object-cover rounded"
        src="/banner.webp"
        loading="eager"
        alt="Storefront banner"
        width={2000}
        height={1000}
        sizes="100vw"
        priority
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl md:text-2xl font-semibold">Featured products</h2>
          <Button asChild variant="link">
            <Link href="/products">Browse all</Link>
          </Button>
        </div>
        <ProductGrid products={featured.items} />
      </section>
    </div>
  );
}
