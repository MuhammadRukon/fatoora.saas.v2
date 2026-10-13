'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddToCartButton } from '@/modules/cart/components/add-to-cart-button';
import type { PublicProductVariant } from '@/contracts/catalog';
import { formatBDT } from '@/server/common/money';
import Link from 'next/link';

interface ProductDetailPurchasePanelProps {
  variants: PublicProductVariant[];
  warrantyMonths: number;
}

function variantLabel(v: PublicProductVariant): string {
  if (v.name) return v.name;
  const attrs = Object.entries(v.attributes);
  if (attrs.length > 0) return attrs.map(([, val]) => val).join(' / ');
  return v.sku;
}

export function ProductDetailPurchasePanel({
  variants,
  warrantyMonths,
}: ProductDetailPurchasePanelProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.find((v) => v.inStock)?.id ?? variants[0]?.id ?? null,
  );

  const variant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) ?? null,
    [variants, selectedVariantId],
  );

  const hasMultipleVariants = variants.length > 1;
  const inStock = !!variant && variant.inStock;

  return (
    <>
      <div className="flex items-baseline gap-3">
        {variant ? (
          <>
            <span className="text-2xl font-semibold">{formatBDT(variant.priceCents)}</span>
            {variant.priceCents < variant.originalPriceCents ? (
              <span className="text-sm text-muted-foreground line-through">
                {formatBDT(variant.originalPriceCents)}
              </span>
            ) : null}
            {!variant.inStock ? <Badge variant="secondary">Out of stock</Badge> : null}
          </>
        ) : (
          <Badge variant="secondary">Unavailable</Badge>
        )}
      </div>

      {hasMultipleVariants ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Choose variant</p>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <Button
                key={v.id}
                type="button"
                variant={selectedVariantId === v.id ? 'default' : 'outline'}
                size="sm"
                disabled={!v.inStock}
                onClick={() => setSelectedVariantId(v.id)}
                className="text-left h-auto py-2"
              >
                <span className="flex flex-col items-start">
                  <span className="text-xs uppercase tracking-wide">{variantLabel(v)}</span>
                  <span className="text-[10px] text-muted-foreground">SKU: {v.sku}</span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex gap-2">
        <AddToCartButton
          variantId={variant?.id ?? null}
          disabled={!inStock}
          className="flex-1"
          label={inStock ? 'Add to cart' : 'Out of stock'}
        />
        <Button size="lg" variant="outline" disabled={!inStock} asChild>
          <Link href="/cart">Go to cart</Link>
        </Button>
      </div>

      {warrantyMonths > 0 ? (
        <p className="text-sm text-muted-foreground">Includes {warrantyMonths}-month warranty.</p>
      ) : null}
    </>
  );
}
