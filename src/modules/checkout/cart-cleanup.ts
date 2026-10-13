import type { CartLine } from '@/contracts/cart';
import { lineUnavailableReason } from '@/modules/cart/availability';

export interface CartCleanupPlan {
  /** Inactive or out-of-stock lines. */
  remove: CartLine[];
  /** Lines above a positive stock, with the quantity to clamp to. */
  reduce: Array<{ line: CartLine; quantity: number }>;
}

/** What checkout must fix in the cart before it can be placed (pure; the caller does the requests). */
export function planCartCleanup(lines: CartLine[]): CartCleanupPlan {
  const plan: CartCleanupPlan = { remove: [], reduce: [] };
  for (const line of lines) {
    if (lineUnavailableReason(line)) plan.remove.push(line);
    else if (line.quantity > line.stock) plan.reduce.push({ line, quantity: line.stock });
  }
  return plan;
}

const joinNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];

/** For example "We removed X and Y. Quantity of Z reduced to 1, only 1 in stock." Null when nothing changed. */
export function cleanupNotice({ remove, reduce }: CartCleanupPlan): string | null {
  const parts = [
    ...(remove.length > 0 ? [`We removed ${joinNames(remove.map((l) => l.productName))}.`] : []),
    ...reduce.map(
      ({ line, quantity }) =>
        `Quantity of ${line.productName} reduced to ${quantity}, only ${quantity} in stock.`,
    ),
  ];
  return parts.length > 0 ? parts.join(' ') : null;
}
