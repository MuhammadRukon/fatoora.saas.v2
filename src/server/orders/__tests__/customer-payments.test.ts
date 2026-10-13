/**
 * Customer-facing responses must expose only the Payment fields the order UI
 * needs: never rawPayload, bankRef, providerRef or verifier ids. Admin
 * responses keep the full row. Live-DB test on hand-built orders; it does not
 * touch the PaymentSettings singleton.
 */
import { CodFeeStatus, PaymentMethod } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { CUSTOMER_PAYMENT_FIELDS } from '@/contracts/payments';
import { prisma } from '@/lib/prisma';
import {
  cleanupCheckoutFixtures,
  createAdminUser,
  createManualOrder,
} from '@/server/checkout/__tests__/fixtures';
import { codFeeService } from '@/server/payments/cod-fee.service';
import { paymentsService } from '@/server/payments/payments.service';

import { ordersService } from '../orders.service';

const SENSITIVE = [
  'rawPayload',
  'bankRef',
  'providerRef',
  'verifiedById',
  'verifiedAt',
  'feeVerifiedById',
  'feeVerifiedAt',
] as const;

afterEach(async () => {
  await cleanupCheckoutFixtures();
});

/** A fee-pending COD order whose payment row carries every internal field. */
async function loadedOrder() {
  const admin = await createAdminUser();
  const fixture = await createManualOrder({
    method: PaymentMethod.COD,
    feeStatus: CodFeeStatus.PENDING,
    feeCents: 10_000,
    bankRef: 'INTERNALREF1',
  });
  await prisma.payment.update({
    where: { id: fixture.payment.id },
    data: {
      rawPayload: { gateway: 'secret-internals' },
      providerRef: `prov-${fixture.payment.id}`,
      verifiedById: admin.id,
      feeVerifiedById: admin.id,
    },
  });
  return fixture;
}

function expectCustomerShape(payment: Record<string, unknown>) {
  for (const key of SENSITIVE) expect(payment, key).not.toHaveProperty(key);
  expect(Object.keys(payment).sort()).toEqual([...CUSTOMER_PAYMENT_FIELDS].sort());
}

describe('customer order responses', () => {
  it('getOwned, listByUser and cancelByCustomer return trimmed payments', async () => {
    const { userId, order, payment } = await loadedOrder();

    const detail = await ordersService.getOwned(userId, order.id);
    expect(detail.payments).toHaveLength(1);
    expectCustomerShape(detail.payments[0]);
    expect(detail.payments[0].id).toBe(payment.id);
    expect(detail.payments[0].feeStatus).toBe(CodFeeStatus.PENDING);
    expect(detail.payments[0].feeCents).toBe(10_000);

    const list = await ordersService.listByUser(userId);
    expectCustomerShape(list[0].payments[0]);

    const cancelled = await ordersService.cancelByCustomer(userId, order.id, 'changed my mind');
    expectCustomerShape(cancelled!.payments[0]);
  });

  it('the customer txn-id response carries no internal fields', async () => {
    const { userId, payment } = await loadedOrder();

    const updated = await codFeeService.submitCustomerTxnId(userId, payment.id, 'abc12345');

    expectCustomerShape(updated);
    expect(updated.customerTxnId).toBe('ABC12345');
  });

  it('the bank reference response carries no internal fields', async () => {
    const { userId, payment } = await createManualOrder({ method: PaymentMethod.BANK_TRANSFER });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { rawPayload: { gateway: 'secret-internals' } },
    });

    const updated = await paymentsService.submitBankReference(userId, payment.id, 'BANKREF0001');

    expectCustomerShape(updated);
  });

  it('admin order detail keeps the full payment row', async () => {
    const { order } = await loadedOrder();

    const detail = await ordersService.getAdmin(order.id);

    for (const key of SENSITIVE) expect(detail.payments[0], key).toHaveProperty(key);
    expect(detail.payments[0].bankRef).toBe('INTERNALREF1');
  });
});
