/**
 * All monetary amounts in the system are stored as integer cents
 * (BDT poisha) to avoid floating-point drift. UI converts at render.
 */

export const CENTS_PER_UNIT = 100;
export const CURRENCY = 'BDT';

const formatter = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatBDT(cents: number, opts: { withSymbol?: boolean } = {}): string {
  const value = formatter.format(cents / CENTS_PER_UNIT);
  return opts.withSymbol === false ? value : `Tk ${value}`;
}

export function takaToCents(taka: number): number {
  if (!Number.isFinite(taka)) {
    throw new Error('Invalid taka amount');
  }
  return Math.round(taka * CENTS_PER_UNIT);
}

export function applyDiscount(unitPriceCents: number, discountCents: number): number {
  if (discountCents <= 0) return unitPriceCents;
  return Math.max(0, unitPriceCents - discountCents);
}

export function applyPercentDiscount(amountCents: number, percent: number): number {
  if (percent <= 0) return 0;
  const clamped = Math.min(100, percent);
  return Math.floor((amountCents * clamped) / 100);
}
