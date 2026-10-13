import { ProductCard } from './product-card';
import type { PublicProductSummary } from '@/contracts/catalog';

export function ProductGrid({ products }: Readonly<{ products: PublicProductSummary[] }>) {
  if (products.length === 0) {
    return (
      <div className="rounded border border-dashed p-12 text-center text-sm text-muted-foreground">
        No products match your filters.
      </div>
    );
  }
  return (
    <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
