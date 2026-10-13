import Image from 'next/image';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatBDT } from '@/server/common/money';
import type { PublicProductSummary } from '@/contracts/catalog';
import { cn, getDiscountPercentString } from '@/lib/utils';

export function ProductCard({ product }: Readonly<{ product: PublicProductSummary }>) {
  const hasDiscount = product.priceCents < product.originalPriceCents;

  return (
    <Link href={`/products/${product.slug}`} className="block group relative">
      {hasDiscount && (
        <p className="text-white bg-red-500 w-fit absolute top-4 right-4 z-20 px-1.5">
          {getDiscountPercentString(product.priceCents, product.originalPriceCents)} OFF
        </p>
      )}
      <Card className="h-full overflow-hidden transition-shadow group-hover:shadow-md p-0 gap-0">
        <div className="relative aspect-square bg-muted">
          <Image
            src={product.imageUrl ? product.imageUrl : '/logo.png'}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className={cn('object-cover', !product.imageUrl && 'p-10')}
          />

          {!product.inStock && (
            <Badge variant="secondary" className="absolute top-2 left-2">
              Out of stock
            </Badge>
          )}
        </div>
        <CardContent className="space-y-1 p-4">
          <p className="text-xs text-muted-foreground">{product.brand.name}</p>
          <h3 className="text-sm font-medium line-clamp-2 leading-snug">{product.name}</h3>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold">{formatBDT(product.priceCents)}</span>
            {hasDiscount ? (
              <span className="text-xs text-muted-foreground line-through">
                {formatBDT(product.originalPriceCents)}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
