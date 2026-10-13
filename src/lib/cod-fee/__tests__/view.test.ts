import { CodFeeStatus, OrderStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { feeNoticeState, feeView, type FeeViewPayment } from '../view';

const STATUSES = Object.values(CodFeeStatus);
const ORDER_STATUSES = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.CANCELLED];
const FEES = [0, 2_000];
const TOTAL = 10_000;

const pay = (feeStatus: CodFeeStatus, feeCents = 2_000, method = 'COD'): FeeViewPayment =>
  ({ method, feeStatus, feeCents }) as FeeViewPayment;

// Expected customer notice, written out per status x order status (PENDING /
// CONFIRMED / CANCELLED), independent of the policy table.
const NOTICE: Record<CodFeeStatus, Record<string, string>> = {
  NONE: { PENDING: 'none', CONFIRMED: 'none', CANCELLED: 'none' },
  PENDING: { PENDING: 'pending', CONFIRMED: 'none', CANCELLED: 'none' },
  REJECTED: { PENDING: 'rejected', CONFIRMED: 'none', CANCELLED: 'none' },
  VERIFIED: { PENDING: 'verified', CONFIRMED: 'verified', CANCELLED: 'none' },
  WAIVED: { PENDING: 'none', CONFIRMED: 'none', CANCELLED: 'none' },
};

describe('feeNoticeState (moved from getFeeNoticeState)', () => {
  const p = (feeStatus: string, method = 'COD') => ({ method, feeStatus }) as never;

  it('is pending only for a PENDING order whose fee is PENDING', () => {
    expect(feeNoticeState('PENDING', p('PENDING'))).toBe('pending');
    expect(feeNoticeState('CONFIRMED', p('PENDING'))).toBe('none');
    expect(feeNoticeState('CANCELLED', p('PENDING'))).toBe('none');
  });

  it('is rejected only while the order is still PENDING', () => {
    expect(feeNoticeState('PENDING', p('REJECTED'))).toBe('rejected');
    expect(feeNoticeState('CANCELLED', p('REJECTED'))).toBe('none');
  });

  it('shows verified for any non-cancelled order (verify confirms the order)', () => {
    expect(feeNoticeState('CONFIRMED', p('VERIFIED'))).toBe('verified');
    expect(feeNoticeState('SHIPPED', p('VERIFIED'))).toBe('verified');
    expect(feeNoticeState('CANCELLED', p('VERIFIED'))).toBe('none');
  });

  it('shows nothing for WAIVED, NONE, non-COD or a missing payment', () => {
    expect(feeNoticeState('PENDING', p('WAIVED'))).toBe('none');
    expect(feeNoticeState('PENDING', p('NONE'))).toBe('none');
    expect(feeNoticeState('PENDING', p('PENDING', 'BKASH'))).toBe('none');
    expect(feeNoticeState('PENDING', undefined)).toBe('none');
  });
});

describe('feeView', () => {
  for (const status of STATUSES) {
    for (const orderStatus of ORDER_STATUSES) {
      for (const feeCents of FEES) {
        const label = `${status} fee, ${orderStatus} order, feeCents ${feeCents}`;
        it(label, () => {
          const v = feeView(pay(status, feeCents), { status: orderStatus, totalCents: TOTAL });
          const orderPending = orderStatus === OrderStatus.PENDING;
          const unverified = status === 'PENDING' || status === 'REJECTED';

          expect(v.status).toBe(status);
          expect(v.show).toBe(status !== 'NONE');
          expect(v.feeCents).toBe(feeCents);
          expect(v.dueCents).toBe(
            status === 'PENDING' || status === 'VERIFIED' ? TOTAL - feeCents : TOTAL,
          );
          expect(v.customerNotice).toBe(NOTICE[status][orderStatus]);
          expect(v.showSummaryRows).toBe(
            feeCents > 0 &&
              (status === 'PENDING' || status === 'REJECTED' || status === 'VERIFIED'),
          );
          expect(v.admin).toEqual({
            canVerify: orderPending && unverified,
            canReject: orderPending && status === 'PENDING',
            canEditTxn: orderPending && unverified,
            confirmWaivesFee: orderPending && unverified,
          });
        });
      }
    }
  }

  it('hides summary rows for a WAIVED fee and charges the full total', () => {
    const v = feeView(pay('WAIVED'), { status: 'CONFIRMED', totalCents: TOTAL });
    expect(v.showSummaryRows).toBe(false);
    expect(v.dueCents).toBe(TOTAL);
    expect(v.show).toBe(true);
  });

  it('is inert for a missing payment', () => {
    const v = feeView(undefined, { status: 'PENDING', totalCents: TOTAL });
    expect(v).toEqual({
      status: 'NONE',
      show: false,
      feeCents: 0,
      dueCents: TOTAL,
      customerNotice: 'none',
      showSummaryRows: false,
      admin: { canVerify: false, canReject: false, canEditTxn: false, confirmWaivesFee: false },
    });
  });

  it('keeps the customer notice COD-only', () => {
    const v = feeView(pay('PENDING', 2_000, 'BKASH'), { status: 'PENDING', totalCents: TOTAL });
    expect(v.customerNotice).toBe('none');
  });
});
