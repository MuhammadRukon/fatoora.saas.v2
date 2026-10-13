import { Star } from 'lucide-react';

import { cn } from '@/lib/utils';

interface RatingStarsProps {
  value: number;
  size?: number;
  className?: string;
}

export function RatingStars({ value, size = 14, className }: RatingStarsProps) {
  const rounded = Math.round(value);
  return (
    <div
      className={cn('inline-flex items-center gap-0.5 text-amber-500', className)}
      aria-label={`${value.toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rounded ? 'fill-amber-500' : 'text-muted-foreground/40'}
        />
      ))}
    </div>
  );
}
