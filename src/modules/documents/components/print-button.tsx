'use client';

import { IconPrinter } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';

export function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button disabled={disabled} onClick={() => window.print()}>
      <IconPrinter />
      Print
    </Button>
  );
}
