import Image from 'next/image';
import type { OrderItem } from '@prisma/client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBDT } from '@/server/common/money';

type OrderItemRow = Pick<
  OrderItem,
  'id' | 'imageUrl' | 'productName' | 'variantName' | 'sku' | 'quantity' | 'unitPriceCents'
>;

/** Snapshotted line items of an order, shared by the customer and admin pages. */
export function OrderItemsCard({ items }: { items: OrderItemRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Items</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {items.map((it) => (
            <li key={it.id} className="flex gap-4 py-3">
              <div className="relative w-16 h-16 bg-muted rounded overflow-hidden shrink-0">
                {it.imageUrl ? (
                  <Image src={it.imageUrl} alt={it.productName} fill className="object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium line-clamp-1">{it.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {it.variantName ? `${it.variantName} · ` : ''}SKU: {it.sku}
                </p>
                <p className="text-sm">
                  {it.quantity} × {formatBDT(it.unitPriceCents)}
                </p>
              </div>
              <div className="text-sm font-medium">
                {formatBDT(it.unitPriceCents * it.quantity)}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
