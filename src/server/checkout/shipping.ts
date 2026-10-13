/**
 * Shipping fee calculation. Two simple tiers for Phase 5:
 *  - Dhaka city: 60 BDT (6000 poisha)
 *  - Outside Dhaka: 120 BDT
 * Free shipping when subtotal >= 5,000 BDT.
 */
export interface ShippingInput {
  city: string;
  subtotalCents: number;
  itemCount: number;
}

const FREE_THRESHOLD = 500_000;
const INSIDE_DHAKA = 6_000;
const OUTSIDE_DHAKA = 12_000;

const DHAKA_KEYWORDS = ['dhaka', 'ঢাকা'];

export function computeShippingCents(input: ShippingInput): number {
  if (input.itemCount <= 0) return 0;
  if (input.subtotalCents >= FREE_THRESHOLD) return 0;
  const c = input.city.trim().toLowerCase();
  return DHAKA_KEYWORDS.some((kw) => c.includes(kw)) ? INSIDE_DHAKA : OUTSIDE_DHAKA;
}
