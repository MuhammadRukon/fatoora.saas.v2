import { CodFeeStatus } from '@prisma/client';

import { cn } from '@/lib/utils';

const LABELS: Record<CodFeeStatus, string> = {
  NONE: 'No fee',
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  WAIVED: 'Waived',
};

const STYLES: Record<CodFeeStatus, string> = {
  NONE: 'bg-muted text-muted-foreground',
  PENDING: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  VERIFIED: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200',
  WAIVED: 'bg-slate-200 text-slate-900 dark:bg-slate-700/60 dark:text-slate-100',
};

/** Badge for the COD confirmation-fee state (text label, not colour alone). */
export function FeeStatusBadge({ status }: { status: CodFeeStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
        STYLES[status],
      )}
    >
      {LABELS[status].toUpperCase()}
    </span>
  );
}
