import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { applyDiscount } from '@/server/common/money';
import { BadRequestError } from '@/server/common/errors';

/** Either the global client or an in-flight `prisma.$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

/** Everything a cart line needs to be priced, checked and snapshotted into an order. */
export const CART_INCLUDE = {
  variant: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          status: true,
          images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

export type LoadedCartItem = Prisma.CartItemGetPayload<{ include: typeof CART_INCLUDE }>;

export interface ResolvedCartLine {
  /** The `CartItem` row this line came from (used to consume the cart). */
  cartItemId: string;
  variantId: string;
  variantName: string | null;
  productId: string;
  productName: string;
  sku: string;
  imageUrl: string | null;
  unitPriceCents: number;
  buyingPriceCents: number;
  quantity: number;
}

export function toCartLine(item: LoadedCartItem): ResolvedCartLine {
  const v = item.variant;
  const p = v.product;
  return {
    cartItemId: item.id,
    variantId: v.id,
    variantName: v.name,
    productId: p.id,
    productName: p.name,
    sku: v.sku,
    imageUrl: p.images[0]?.url ?? null,
    unitPriceCents: applyDiscount(v.sellingPriceCents, v.discountCents),
    buyingPriceCents: v.buyingPriceCents,
    quantity: item.quantity,
  };
}

/**
 * The user's cart rows plus their resolved lines (same order). Throws
 * `BadRequestError('Cart is empty')` for an empty cart. Availability and
 * stock are NOT checked here; callers do that at the point their flow needs it.
 */
export async function loadCart(
  db: Db,
  userId: string,
): Promise<{ items: LoadedCartItem[]; lines: ResolvedCartLine[] }> {
  const items = await db.cartItem.findMany({
    where: { cart: { userId } },
    include: CART_INCLUDE,
  });
  if (items.length === 0) {
    throw new BadRequestError('Cart is empty');
  }
  return { items, lines: items.map(toCartLine) };
}
