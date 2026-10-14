import type { Metadata } from 'next';

import { ZatcaPanel } from '@/modules/zatca/components/zatca-panel';

export const metadata: Metadata = { title: 'ZATCA' };

export default function ZatcaPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">ZATCA onboarding</h1>
        <p className="text-muted-foreground">Connect your e-invoicing unit to ZATCA so invoices can be signed and reported.</p>
      </div>
      <ZatcaPanel />
    </div>
  );
}
