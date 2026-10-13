export type PendingAction =
  | { kind: 'payment'; id: string; orderNumber: string; outcome: 'SUCCEEDED' | 'FAILED' }
  | { kind: 'fee'; id: string; orderNumber: string; outcome: 'VERIFIED' | 'REJECTED' };

export type PendingActionKind = PendingAction['kind'];

export type PendingActionOutcome<K extends PendingActionKind> = Extract<
  PendingAction,
  { kind: K }
>['outcome'];

/** Builds the action awaiting admin confirmation, tying `outcome` to its `kind`. */
export function makePendingAction<K extends PendingActionKind>(
  kind: K,
  outcome: PendingActionOutcome<K>,
  target: { id: string; orderNumber: string },
): PendingAction {
  return { kind, id: target.id, orderNumber: target.orderNumber, outcome } as PendingAction;
}

export function describeAction(a: PendingAction): {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
} {
  if (a.kind === 'fee') {
    return a.outcome === 'VERIFIED'
      ? {
          title: 'Verify the confirmation fee?',
          description: `The fee for order ${a.orderNumber} will be marked verified and the order confirmed.`,
          confirmLabel: 'Verify fee',
          destructive: false,
        }
      : {
          title: 'Reject the confirmation fee?',
          description: `The fee for order ${a.orderNumber} will be rejected. The order stays pending and the customer is told the fee could not be verified. You can still verify it later if it arrives.`,
          confirmLabel: 'Reject fee',
          destructive: true,
        };
  }
  return a.outcome === 'SUCCEEDED'
    ? {
        title: 'Verify this payment?',
        description: `Order ${a.orderNumber} will be marked as paid and confirmed.`,
        confirmLabel: 'Verify',
        destructive: false,
      }
    : {
        title: 'Reject this payment?',
        description: `The payment for order ${a.orderNumber} will be marked as failed.`,
        confirmLabel: 'Reject',
        destructive: true,
      };
}
