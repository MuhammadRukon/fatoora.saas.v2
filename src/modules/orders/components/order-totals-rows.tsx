import type { Order } from '@prisma/client';

import type { FeeView } from '@/lib/cod-fee/view';
import { formatBDT } from '@/server/common/money';
import { FeeSummaryRows } from '@/modules/orders/components/fee-summary-rows';

type OrderTotals = Pick<
  Order,
  'subtotalCents' | 'couponCode' | 'discountCents' | 'shippingCents' | 'totalCents'
>;

interface OrderTotalsRowsProps {
  order: OrderTotals;
  fee: Pick<FeeView, 'showSummaryRows' | 'feeCents' | 'dueCents'>;
  /** Mutes the advance-fee row (admin order page styling). */
  mutedFee?: boolean;
}

/**
 * Subtotal / Discount / Shipping / Total rows plus the COD fee rows, to be
 * placed inside a summary card's `CardContent`. The page owns the payment line.
 */
export function OrderTotalsRows({ order, fee, mutedFee = false }: OrderTotalsRowsProps) {
  return (
    <>
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{formatBDT(order.subtotalCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Discount {order.couponCode ? `(${order.couponCode})` : ''}</span>
        <span>- {formatBDT(order.discountCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Shipping</span>
        <span>{formatBDT(order.shippingCents)}</span>
      </div>
      <div className="flex justify-between border-t pt-2 mt-2 font-semibold">
        <span>Total</span>
        <span>{formatBDT(order.totalCents)}</span>
      </div>
      <FeeSummaryRows view={fee} muted={mutedFee} />
    </>
  );
}
