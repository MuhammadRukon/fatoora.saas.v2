'use client';

import { useState, type FormEvent } from 'react';
import type { Payment } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TXN_ID_MAX, TXN_ID_MIN, txnIdSchema } from '@/contracts/payments';
import { DuplicateTxnDialog } from '@/modules/admin/payments/components/duplicate-txn-dialog';
import {
  getDuplicateTxnInfo,
  useAdminSetTxnId,
  type DuplicateTxnInfo,
} from '@/modules/admin/payments/hooks';

interface AdminTxnIdDialogProps {
  payment: Pick<Payment, 'id' | 'customerTxnId'>;
  /** Whether the "Add/Edit transaction ID" trigger shows (the dialogs stay mounted regardless). */
  canEdit: boolean;
}

/**
 * Trigger button plus the add/edit transaction-id dialog and the duplicate-id
 * notice for the admin COD fee panel. Owns the form state and the mutation.
 */
export function AdminTxnIdDialog({ payment, canEdit }: AdminTxnIdDialogProps) {
  const setTxnId = useAdminSetTxnId();

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnValue, setTxnValue] = useState('');
  const [txnError, setTxnError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateTxnInfo | null>(null);

  function openTxnDialog() {
    setTxnValue(payment.customerTxnId ?? '');
    setTxnError(null);
    setTxnOpen(true);
  }

  function submitTxn(e: FormEvent) {
    e.preventDefault();
    const parsed = txnIdSchema.safeParse(txnValue);
    if (!parsed.success) {
      setTxnError(parsed.error.issues[0]?.message ?? 'Enter a valid transaction ID');
      return;
    }
    setTxnError(null);
    setTxnId.mutate(
      { id: payment.id, txnId: parsed.data },
      {
        onSuccess: () => setTxnOpen(false),
        onError: (err) => {
          const dup = getDuplicateTxnInfo(err);
          if (dup) {
            setTxnOpen(false);
            setDuplicate(dup);
          }
        },
      },
    );
  }

  return (
    <>
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={openTxnDialog}>
          {payment.customerTxnId ? 'Edit transaction ID' : 'Add transaction ID'}
        </Button>
      ) : null}

      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent>
          <form onSubmit={submitTxn} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>
                {payment.customerTxnId ? 'Edit transaction ID' : 'Add transaction ID'}
              </DialogTitle>
              <DialogDescription>
                {TXN_ID_MIN} to {TXN_ID_MAX} letters and numbers. It is stored in upper case and
                must not be used on another order.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="admin-txn-id">Transaction ID</Label>
              <Input
                id="admin-txn-id"
                autoComplete="off"
                value={txnValue}
                aria-invalid={!!txnError}
                aria-describedby={txnError ? 'admin-txn-id-error' : undefined}
                onChange={(e) => setTxnValue(e.target.value)}
              />
              {txnError ? (
                <p id="admin-txn-id-error" className="text-sm text-destructive">
                  {txnError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTxnOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={setTxnId.isPending}>
                {setTxnId.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DuplicateTxnDialog duplicate={duplicate} onClose={() => setDuplicate(null)} />
    </>
  );
}
