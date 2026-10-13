import type { CartLine, CartSnapshot, GuestCartLine } from '@/contracts/cart';

/** A guest cart validated longer ago than this is re-hydrated on the next panel open or cart view. */
const REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000;

export type UnavailableReason = 'No longer available' | 'Sold out';

/** Null when the line can be bought (a quantity above stock is a separate, clampable issue). */
export function lineUnavailableReason(
  line: Pick<CartLine, 'isActive' | 'stock'>,
): UnavailableReason | null {
  if (!line.isActive) return 'No longer available';
  if (line.stock <= 0) return 'Sold out';
  return null;
}

export interface CartAvailability {
  itemCount: number;
  subtotalCents: number;
  unavailableCount: number;
}

/** Item count and subtotal over the buyable lines only. */
export function cartAvailability(lines: CartLine[]): CartAvailability {
  const result: CartAvailability = { itemCount: 0, subtotalCents: 0, unavailableCount: 0 };
  for (const l of lines) {
    if (lineUnavailableReason(l)) result.unavailableCount += 1;
    else {
      result.itemCount += l.quantity;
      result.subtotalCents += l.unitPriceCents * l.quantity;
    }
  }
  return result;
}

export function cartHeaderLabel({ itemCount, unavailableCount }: CartAvailability): string {
  const items = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  return unavailableCount > 0 ? `${items} · ${unavailableCount} unavailable` : items;
}

/** Raw quantity sum minus the lines the last hydrate found dead (lines added since still count). */
export function guestBadgeCount(lines: GuestCartLine[], unavailable: string[]): number {
  return lines.reduce((sum, l) => (unavailable.includes(l.variantId) ? sum : sum + l.quantity), 0);
}

export function needsRevalidation(lastValidatedAt: number | null, now = Date.now()): boolean {
  return lastValidatedAt === null || now - lastValidatedAt > REVALIDATE_AFTER_MS;
}

/** missing = variant gone (hydrate returned nothing for it); unavailable = exists but inactive or sold out. */
export function classifyHydrate(requested: GuestCartLine[], snapshot: CartSnapshot) {
  const returned = new Map(snapshot.lines.map((l) => [l.variantId, l] as const));
  const missing: string[] = [];
  const unavailable: string[] = [];
  for (const { variantId } of requested) {
    const l = returned.get(variantId);
    if (!l) missing.push(variantId);
    else if (lineUnavailableReason(l)) unavailable.push(variantId);
  }
  return { missing, unavailable };
}
