'use client';

import { useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PaymentSettingsInput } from '@/contracts/payment-settings';
import { formatBDT } from '@/server/common/money';
import { computeCodConfirmationFee } from '@/lib/cod-fee/compute';

const DEFAULT_SAMPLE_BDT = '498.40';

/** Parses a BDT amount typed by an admin ("498.40") to integer cents, or null. */
function parseBdtToCents(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/**
 * Live "what would the customer pay" preview. Watches only the three fee
 * fields (and owns the sample amount), so unrelated edits elsewhere in the
 * form do not re-render it.
 */
export function FeePreview({ control }: { control: Control<PaymentSettingsInput> }) {
  const [codFeeEnabled, codFeeType, codFeeValue] = useWatch({
    control,
    name: ['codFeeEnabled', 'codFeeType', 'codFeeValue'],
  });
  const [sampleBdt, setSampleBdt] = useState(DEFAULT_SAMPLE_BDT);

  const preview = useMemo(() => {
    if (!codFeeEnabled || codFeeType === undefined) return null;
    const totalCents = parseBdtToCents(sampleBdt);
    if (totalCents === null || codFeeValue === undefined) return null;
    try {
      const fee = computeCodConfirmationFee({
        type: codFeeType,
        value: codFeeValue,
        totalCents,
      });
      return { totalCents, fee };
    } catch {
      return null;
    }
  }, [codFeeEnabled, codFeeType, codFeeValue, sampleBdt]);

  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="fee-sample">Preview on an order of Tk</Label>
        <Input
          id="fee-sample"
          className="w-28"
          inputMode="decimal"
          value={sampleBdt}
          onChange={(e) => setSampleBdt(e.target.value)}
        />
      </div>
      <p aria-live="polite" data-testid="fee-preview">
        {!codFeeEnabled
          ? 'Turn the fee on to see a preview.'
          : preview
            ? `On an order of ${formatBDT(preview.totalCents)} → fee ${formatBDT(preview.fee)}, due on delivery ${formatBDT(preview.totalCents - preview.fee)}`
            : 'Enter a valid order amount and fee to see a preview.'}
      </p>
    </div>
  );
}
