import { CodFeeStatus, CodFeeType, OrderStatus, PaymentMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { planPlacement } from '../registry';

const FEE_ON = { codFeeEnabled: true, codFeeType: CodFeeType.FLAT, codFeeValue: 10_000 };
const FEE_OFF = { ...FEE_ON, codFeeEnabled: false };

describe('planPlacement: COD', () => {
  it('no fee: auto-confirms with the placed and auto-confirmed events, in order', () => {
    const plan = planPlacement(PaymentMethod.COD, { settings: FEE_OFF, totalCents: 106_000 });

    expect(plan).toEqual({
      paymentFields: {},
      initialStatus: OrderStatus.CONFIRMED,
      events: [
        { status: OrderStatus.PENDING, note: 'Order placed' },
        { status: OrderStatus.CONFIRMED, note: 'COD order auto-confirmed; awaiting fulfilment' },
      ],
      feeRequired: false,
      fee: null,
    });
  });

  it('fee applies: PENDING order, fee snapshot columns and the fee-pending event', () => {
    const plan = planPlacement(PaymentMethod.COD, { settings: FEE_ON, totalCents: 106_000 });

    expect(plan.initialStatus).toBe(OrderStatus.PENDING);
    expect(plan.feeRequired).toBe(true);
    expect(plan.fee).toEqual({
      feeCents: 10_000,
      rule: { type: CodFeeType.FLAT, value: 10_000 },
    });
    expect(plan.paymentFields).toEqual({
      feeCents: 10_000,
      feeType: CodFeeType.FLAT,
      feeValue: 10_000,
      feeStatus: CodFeeStatus.PENDING,
    });
    expect(plan.events).toEqual([
      { status: OrderStatus.PENDING, note: 'Order placed' },
      { status: OrderStatus.PENDING, note: 'COD confirmation fee pending' },
    ]);
  });

  it('fee applies: stores the txn id normalized with its submit time', () => {
    const plan = planPlacement(PaymentMethod.COD, {
      settings: FEE_ON,
      totalCents: 106_000,
      customerTxnId: ' abc12345 ',
    });

    expect(plan.paymentFields.customerTxnId).toBe('ABC12345');
    expect(plan.paymentFields.txnSubmittedAt).toBeInstanceOf(Date);
  });

  it('no fee: ignores a supplied txn id', () => {
    const plan = planPlacement(PaymentMethod.COD, {
      settings: FEE_OFF,
      totalCents: 106_000,
      customerTxnId: 'ABC12345',
    });

    expect(plan.paymentFields).toEqual({});
  });

  it('a zero total resolves no fee (auto-confirm)', () => {
    const plan = planPlacement(PaymentMethod.COD, { settings: FEE_ON, totalCents: 0 });
    expect(plan.initialStatus).toBe(OrderStatus.CONFIRMED);
    expect(plan.fee).toBeNull();
  });
});

describe('planPlacement: other methods', () => {
  it('get a PENDING order with only the placed event and no fee, even with the fee on', () => {
    for (const method of [
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.BKASH,
      PaymentMethod.SSLCOMMERZ,
    ]) {
      expect(
        planPlacement(method, {
          settings: FEE_ON,
          totalCents: 500_000,
          customerTxnId: 'ABC12345',
        }),
      ).toEqual({
        paymentFields: {},
        initialStatus: OrderStatus.PENDING,
        events: [{ status: OrderStatus.PENDING, note: 'Order placed' }],
        feeRequired: false,
        fee: null,
      });
    }
  });
});
