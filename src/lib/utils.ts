import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
