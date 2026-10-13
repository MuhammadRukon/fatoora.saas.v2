'use client';

import { useEffect } from 'react';

import type { CartLine } from '@/contracts/cart';
import { cartAvailability } from '@/modules/cart/availability';
import { useGuestCart } from '@/modules/cart/guest-cart';

/**
 * Inline notices shared by the cart panel and the cart page: the unavailable-lines
 * warning (checkout stays enabled) and the one-off "no longer sold" prune notice.
 */
export function CartNotices({ lines }: Readonly<{ lines: CartLine[] | undefined }>) {
  const prunedCount = useGuestCart((s) => s.prunedCount);
  const dismissPruned = useGuestCart((s) => s.dismissPruned);
  // The notice is shown once: leaving the panel / page dismisses it.
  useEffect(() => dismissPruned, [dismissPruned]);

  const hasUnavailable = !!lines && cartAvailability(lines).unavailableCount > 0;
  if (!hasUnavailable && prunedCount === 0) return null;

  return (
    <div className="space-y-2 text-sm" role="status">
      {prunedCount > 0 ? (
        <p className="text-muted-foreground">
          {prunedCount === 1
            ? '1 item is no longer sold and was removed'
            : `${prunedCount} items are no longer sold and were removed`}
        </p>
      ) : null}
      {hasUnavailable ? (
        <p className="text-amber-600 dark:text-amber-400">
          Some items are unavailable. Remove them, or they will be removed automatically when you
          check out.
        </p>
      ) : null}
    </div>
  );
}
