import { formatBDT } from '@/server/common/money';
import type { FeeView } from '@/lib/cod-fee/view';

interface FeeSummaryRowsProps {
  view: Pick<FeeView, 'showSummaryRows' | 'feeCents' | 'dueCents'>;
  /** Mutes the advance-fee row (admin order page styling). */
  muted?: boolean;
}

/**
 * "Confirmation fee (advance)" and "Due on delivery" rows for an order
 * summary card. Renders nothing when `view.showSummaryRows` is false (no fee,
 * or a WAIVED fee that was never collected).
 */
export function FeeSummaryRows({ view, muted = false }: FeeSummaryRowsProps) {
  if (!view.showSummaryRows) return null;
  return (
    <>
      <div className={muted ? 'flex justify-between text-muted-foreground' : 'flex justify-between'}>
        <span>Confirmation fee (advance)</span>
        <span>{formatBDT(view.feeCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Due on delivery</span>
        <span>{formatBDT(view.dueCents)}</span>
      </div>
    </>
  );
}
