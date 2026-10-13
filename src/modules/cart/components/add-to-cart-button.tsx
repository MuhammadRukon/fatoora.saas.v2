'use client';

import { Button } from '@/components/ui/button';
import { useCartMutations } from '@/modules/cart/hooks';

interface AddToCartButtonProps {
  variantId: string | null;
  disabled?: boolean;
  label?: string;
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  /** Known stock of the variant; guests cannot add past it. */
  maxStock?: number;
}

export function AddToCartButton({
  variantId,
  disabled,
  label = 'Add to cart',
  className,
  size = 'lg',
  maxStock,
}: AddToCartButtonProps) {
  const { addItem } = useCartMutations();

  return (
    <Button
      type="button"
      size={size}
      className={className}
      disabled={!variantId || disabled || addItem.isPending}
      onClick={() => {
        if (!variantId) return;
        addItem.mutate({ variantId, quantity: 1, maxStock });
      }}
    >
      {addItem.isPending ? 'Adding...' : label}
    </Button>
  );
}
