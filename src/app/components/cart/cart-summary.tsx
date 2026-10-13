'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CartSnapshot } from '@/contracts/cart';
import { cn } from '@/lib/utils';
import { cartAvailability } from '@/modules/cart/availability';
import { formatBDT } from '@/server/common/money';

export interface CartSummaryProps {
  cart: CartSnapshot | null | undefined;
  authenticated: boolean;
  isPanel?: boolean;
  /** Guest prices are being hydrated: show a skeleton for the subtotal. */
  priceLoading?: boolean;
}

export function CartSummary({
  cart,
  authenticated,
  isPanel = false,
  priceLoading = false,
}: Readonly<CartSummaryProps>) {
  // Unavailable lines stay in the cart but are not counted or priced.
  const { itemCount, subtotalCents: subtotal } = cartAvailability(cart?.lines ?? []);

  const rows = (
    <>
      {isPanel ? null : <h2 className="text-lg font-semibold">Order summary</h2>}
      <div className="flex justify-between text-sm">
        <span>Items</span>
        <span>{itemCount}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Subtotal</span>
        {priceLoading ? <Skeleton className="h-4 w-16" /> : <span>{formatBDT(subtotal)}</span>}
      </div>
      {isPanel ? null : (
        <p className="text-xs text-muted-foreground">Shipping & coupons calculated at checkout.</p>
      )}
      {!isPanel && (
        <Button className="w-full" disabled={!cart || cart.lines.length === 0} asChild>
          {authenticated ? (
            <Link href="/checkout">Proceed to checkout</Link>
          ) : (
            <Link href="/login?callbackUrl=/checkout">Sign in to checkout</Link>
          )}
        </Button>
      )}
    </>
  );

  if (isPanel) return <div className={cn('space-y-3')}>{rows}</div>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">{rows}</CardContent>
    </Card>
  );
}
