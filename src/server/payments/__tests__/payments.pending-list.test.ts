/**
 * `listPendingForVerification` feeds the admin payments page. Live-DB test;
 * does not touch the PaymentSettings singleton, so it runs in the parallel project.
 */
import { CodFeeStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { cleanupCheckoutFixtures, createManualOrder } from '@/server/checkout/__tests__/fixtures';

import { paymentsService } from '../payments.service';

afterEach(async () => {
  await cleanupCheckoutFixtures();
});

/**
 * `listPendingForVerification` lists every pending payment globally and loads
 * each payment's order in a second query. Other test files create and delete
 * orders concurrently (payments cascade with their order), so a payment can
 * disappear between the two queries and Prisma throws "Inconsistent query
 * result: Field order is required ... got null". That is a race with other
 * files' cleanup, not a defect in the query, so retry on exactly that error.
 */
const MAX_RETRIES = 3;

function isTransientListRace(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientUnknownRequestError &&
    err.message.includes('Inconsistent query result') &&
    err.message.includes('Field order is required')
  );
}

/** The listing restricted to this test's own payments, so other files' rows never matter. */
async function listOwn(...paymentIds: string[]) {
  for (let attempt = 0; ; attempt++) {
    try {
      const all = await paymentsService.listPendingForVerification();
      return all.filter((p) => paymentIds.includes(p.id));
    } catch (err) {
      if (!isTransientListRace(err) || attempt >= MAX_RETRIES) throw err;
    }
  }
}

describe('paymentsService.listPendingForVerification', () => {
  it('returns customerTxnId, feeCents and feeStatus for a fee-pending COD payment', async () => {
    const { payment, order } = await createManualOrder({
      method: PaymentMethod.COD,
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
      customerTxnId: 'LISTTXN1234',
    });

    const [row] = await listOwn(payment.id);

    expect(row).toBeDefined();
    expect(row?.customerTxnId).toBe('LISTTXN1234');
    expect(row?.feeCents).toBe(10_000);
    expect(row?.feeStatus).toBe(CodFeeStatus.PENDING);
    expect(row?.order.orderNumber).toBe(order.orderNumber);
  });

  it('a plain COD payment reports feeStatus NONE, feeCents 0 and no txn id', async () => {
    const { payment } = await createManualOrder({ method: PaymentMethod.COD });

    const [row] = await listOwn(payment.id);

    expect(row?.feeStatus).toBe(CodFeeStatus.NONE);
    expect(row?.feeCents).toBe(0);
    expect(row?.customerTxnId).toBeNull();
  });

  it('excludes payments of cancelled orders', async () => {
    const live = await createManualOrder({ method: PaymentMethod.COD });
    const cancelled = await createManualOrder({
      method: PaymentMethod.COD,
      orderStatus: OrderStatus.CANCELLED,
    });

    const ids = (await listOwn(live.payment.id, cancelled.payment.id)).map((p) => p.id);

    expect(ids).toEqual([live.payment.id]);
  });
});
