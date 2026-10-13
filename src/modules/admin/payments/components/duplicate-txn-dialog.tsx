'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DuplicateTxnInfo } from '@/modules/admin/payments/hooks';

interface DuplicateTxnDialogProps {
  /** The order that already uses the id; null closes the dialog. */
  duplicate: DuplicateTxnInfo | null;
  onClose: () => void;
}

/**
 * Admin-only. Shown when the txn-id route answers 409 TXN_ID_DUPLICATE with
 * `meta.existingOrderId/existingOrderNumber`. The id was NOT saved.
 */
export function DuplicateTxnDialog({ duplicate, onClose }: DuplicateTxnDialogProps) {
  return (
    <Dialog open={!!duplicate} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction ID already used</DialogTitle>
          <DialogDescription>
            {duplicate
              ? `This transaction ID is already used on order #${duplicate.existingOrderNumber}. It was not saved on this order.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {duplicate ? (
            <Button asChild>
              <Link
                href={`/dashboard/orders/${duplicate.existingOrderId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open order
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
