/**
 * Live-DB tests for `findPaymentByTxnId`: the exact `customerTxnId` branch and
 * the case-insensitive `bankRef` branch, combined with `excludePaymentId`.
 * Payments are hand-built via `createManualOrder` (no PaymentSettings access).
 */
import { PaymentMethod } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { cleanupCheckoutFixtures, createManualOrder } from '@/server/checkout/__tests__/fixtures';

import { findPaymentByTxnId } from '../txn-id';

afterEach(async () => {
  await cleanupCheckoutFixtures();
});

function uniqueId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

describe('findPaymentByTxnId with excludePaymentId', () => {
  it('excludes a payment whose own bankRef equals the id, but still finds another payment bankRef in a different case', async () => {
    const id = uniqueId('FIND');
    const own = await createManualOrder({ method: PaymentMethod.BANK_TRANSFER, bankRef: id });

    // Only the excluded payment carries the id: nothing else matches.
    expect(await findPaymentByTxnId(prisma, id, own.payment.id)).toBeNull();
    // Without the exclusion it is found (the raw lookup does match it).
    expect((await findPaymentByTxnId(prisma, id))?.id).toBe(own.payment.id);

    // Another payment holds the same reference in different case: found, even
    // though the raw bankRef lookup sees both and the excluded one is skipped.
    const other = await createManualOrder({
      method: PaymentMethod.BANK_TRANSFER,
      bankRef: id.toLowerCase(),
    });
    const found = await findPaymentByTxnId(prisma, id, own.payment.id);
    expect(found?.id).toBe(other.payment.id);
    expect(found?.order.orderNumber).toBe(other.order.orderNumber);
  });

  it('matches a customerTxnId exactly (normalized input) and honors the exclusion', async () => {
    const id = uniqueId('CUST');
    const holder = await createManualOrder({ customerTxnId: id });

    // Input is normalized (trim + uppercase) before the exact match.
    expect((await findPaymentByTxnId(prisma, `  ${id.toLowerCase()} `))?.id).toBe(
      holder.payment.id,
    );
    expect(await findPaymentByTxnId(prisma, id, holder.payment.id)).toBeNull();

    const bystander = await createManualOrder();
    expect((await findPaymentByTxnId(prisma, id, bystander.payment.id))?.id).toBe(
      holder.payment.id,
    );
  });
});
