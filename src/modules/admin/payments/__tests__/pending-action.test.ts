import { describe, expect, it } from 'vitest';

import { describeAction, makePendingAction } from '../pending-action';

const target = { id: 'pay_1', orderNumber: 'ORD-100' };

describe('makePendingAction', () => {
  it('copies the target and keeps kind and outcome together', () => {
    expect(makePendingAction('fee', 'VERIFIED', target)).toEqual({
      kind: 'fee',
      id: 'pay_1',
      orderNumber: 'ORD-100',
      outcome: 'VERIFIED',
    });
    expect(makePendingAction('payment', 'FAILED', target)).toEqual({
      kind: 'payment',
      id: 'pay_1',
      orderNumber: 'ORD-100',
      outcome: 'FAILED',
    });
  });
});

describe('describeAction', () => {
  it('describes verifying a fee as non-destructive', () => {
    expect(describeAction(makePendingAction('fee', 'VERIFIED', target))).toEqual({
      title: 'Verify the confirmation fee?',
      description: 'The fee for order ORD-100 will be marked verified and the order confirmed.',
      confirmLabel: 'Verify fee',
      destructive: false,
    });
  });

  it('describes rejecting a fee as destructive', () => {
    const copy = describeAction(makePendingAction('fee', 'REJECTED', target));
    expect(copy.title).toBe('Reject the confirmation fee?');
    expect(copy.description).toContain('The fee for order ORD-100 will be rejected.');
    expect(copy.confirmLabel).toBe('Reject fee');
    expect(copy.destructive).toBe(true);
  });

  it('describes verifying a payment', () => {
    expect(describeAction(makePendingAction('payment', 'SUCCEEDED', target))).toEqual({
      title: 'Verify this payment?',
      description: 'Order ORD-100 will be marked as paid and confirmed.',
      confirmLabel: 'Verify',
      destructive: false,
    });
  });

  it('describes rejecting a payment', () => {
    expect(describeAction(makePendingAction('payment', 'FAILED', target))).toEqual({
      title: 'Reject this payment?',
      description: 'The payment for order ORD-100 will be marked as failed.',
      confirmLabel: 'Reject',
      destructive: true,
    });
  });
});
