'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBDT } from '@/server/common/money';
import type { CheckoutQuote } from '@/contracts/checkout';
import { FeeSummaryRows } from '@/modules/orders/components/fee-summary-rows';
import { cn } from '@/lib/utils';

interface OrderSummaryCardProps {
  couponCode: string;
  onCouponCodeChange: (code: string) => void;
  appliedCoupon: string | null;
  onApplyCoupon: () => void;
  quote: CheckoutQuote | null;
  /** A quote request is in flight; with no quote yet, amounts show a placeholder. */
  quoting: boolean;
  /** Shown as the subtotal until a quote arrives. */
  cartSubtotalCents: number | undefined;
  /** Fee rows only for a settled COD quote with a fee. */
  feeActive: boolean;
  placeOrderDisabled: boolean;
  submitting: boolean;
  onPlaceOrder: () => void;
}

export function OrderSummaryCard({
  couponCode,
  onCouponCodeChange,
  appliedCoupon,
  onApplyCoupon,
  quote,
  quoting,
  cartSubtotalCents,
  feeActive,
  placeOrderDisabled,
  submitting,
  onPlaceOrder,
}: OrderSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="coupon">Coupon</Label>
          <div className="flex gap-2">
            <Input
              id="coupon"
              value={couponCode}
              onChange={(e) => onCouponCodeChange(e.target.value.trim())}
              placeholder="Code"
              className="w-full"
            />
            <Button
              type="button"
              variant="outline"
              onClick={onApplyCoupon}
              disabled={!couponCode}
              className={cn('px-6 ', couponCode ? '!bg-black !border-black' : 'opacity-50')}
            >
              Apply
            </Button>
          </div>
          {appliedCoupon ? (
            <p className="text-xs text-muted-foreground">Applied: {appliedCoupon}</p>
          ) : null}
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBDT(quote?.subtotalCents ?? cartSubtotalCents ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Discount</span>
            <span>{quoting && !quote ? '...' : `- ${formatBDT(quote?.discountCents ?? 0)}`}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span>{quote ? formatBDT(quote.shippingCents) : '...'}</span>
          </div>
          <div className="flex justify-between font-semibold pt-2 border-t mt-2">
            <span>Total</span>
            <span>{quote ? formatBDT(quote.totalCents) : '...'}</span>
          </div>
          {feeActive && quote ? (
            <FeeSummaryRows
              view={{
                showSummaryRows: true,
                feeCents: quote.codFeeCents,
                dueCents: quote.dueOnDeliveryCents,
              }}
            />
          ) : null}
        </div>
        <Button className="w-full" size="lg" disabled={placeOrderDisabled} onClick={onPlaceOrder}>
          {submitting ? 'Placing order...' : 'Place order'}
        </Button>
        <p className="text-xs text-muted-foreground">
          By placing your order you agree to the standard terms of sale.
        </p>
      </CardContent>
    </Card>
  );
}
