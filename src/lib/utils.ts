import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Gregorian date in UTC (subscription periods are UTC instants), e.g. "28 Feb 2026". */
export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function getDiscountPercentString(price: number, originalPrice: number): string {
  if (!price || !originalPrice || price >= originalPrice) {
    return '';
  }

  const rawPercent = ((originalPrice - price) / originalPrice) * 100;
  const roundedPercent = Math.round(rawPercent);
  const isFractional = !Number.isInteger(rawPercent);

  return `${isFractional ? '~' : ''}${roundedPercent}%`;
}
