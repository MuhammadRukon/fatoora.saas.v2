import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { normalizeTxnId } from '@/contracts/payments';
import { TxnIdDuplicateError } from '@/server/common/errors';

/** Either the global client or an in-flight `prisma.$transaction` callback client. */
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Finds a payment that already uses this transaction id, as a customer-
 * submitted id or a bank-transfer reference. Optionally ignores one payment
 * (the one being edited).
 *
 * `customerTxnId` is always stored normalized (trimmed, uppercase), so it is
 * matched exactly: that keeps its unique index usable. `bankRef` is free text
 * entered before normalization existed, so it stays case-insensitive. Prisma
 * compiles `mode: 'insensitive'` to `ILIKE`, which cannot use a btree index, so
 * that branch is a raw `lower("bankRef") = lower($1)` lookup served by the
 * `Payment_bankRef_lower_idx` functional index (see its migration; the Prisma
 * schema cannot express it).
 */
export async function findPaymentByTxnId(client: Db, txnId: string, excludePaymentId?: string) {
  const id = normalizeTxnId(txnId);
  const bankRefMatches = await client.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "Payment" WHERE lower("bankRef") = lower(${id})${
      excludePaymentId ? Prisma.sql` AND "id" <> ${excludePaymentId}` : Prisma.empty
    } LIMIT 1`,
  );
  return client.payment.findFirst({
    where: {
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
      OR: [{ customerTxnId: id }, ...bankRefMatches.map((m) => ({ id: m.id }))],
    },
    select: { id: true, order: { select: { id: true, orderNumber: true } } },
  });
}

const TXN_ID_FIELD = 'customerTxnId';

/** A P2002 target naming the txn id: a field list (exact name) or a constraint name (contains it). */
function namesTxnIdField(target: unknown): boolean {
  if (Array.isArray(target)) return target.some((field) => field === TXN_ID_FIELD);
  return typeof target === 'string' && target.includes(TXN_ID_FIELD);
}

/**
 * True only for the unique-constraint violation on `Payment.customerTxnId`.
 * Other unique violations in the same write (e.g. `Order.orderNumber`) are not
 * a duplicate txn id. Prisma reports the violated index in `meta.target` as a
 * field list (`[customerTxnId]`) or, for some providers, a constraint name
 * (`Payment_customerTxnId_key`); driver adapters nest it under
 * `meta.driverAdapterError.cause.constraint`.
 */
export function isTxnIdUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const meta = err.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  return (
    namesTxnIdField(meta?.target) ||
    namesTxnIdField(constraint?.fields) ||
    namesTxnIdField(constraint?.index)
  );
}

export interface TxnIdCheckOptions {
  /** Ignore this payment (the one being edited). */
  excludePaymentId?: string;
  /**
   * Admin-only: put the conflicting order's id/number in the error. Customer
   * callers leave this off so a duplicate reveals nothing about another order.
   */
  revealOrder?: boolean;
}

function duplicateError(
  existing: { order: { id: string; orderNumber: string } } | null,
  revealOrder?: boolean,
) {
  if (!existing || !revealOrder) return new TxnIdDuplicateError();
  return new TxnIdDuplicateError(
    `Transaction ID is already used on order ${existing.order.orderNumber}`,
    { existingOrderId: existing.order.id, existingOrderNumber: existing.order.orderNumber },
  );
}

/** Pre-check: throws TxnIdDuplicateError if another payment already uses `txnId`. */
export async function assertTxnIdFree(
  db: Db,
  txnId: string,
  opts: TxnIdCheckOptions = {},
): Promise<void> {
  const existing = await findPaymentByTxnId(db, txnId, opts.excludePaymentId);
  if (existing) throw duplicateError(existing, opts.revealOrder);
}

/**
 * For a write that lost a race on the `customerTxnId` unique index despite
 * `assertTxnIdFree`: maps that P2002 to the same TxnIdDuplicateError the
 * pre-check throws. Any other error, including a P2002 on a different unique
 * index, is returned unchanged. Use as
 * `throw await mapTxnIdViolation(err, txnId, opts)`.
 */
export async function mapTxnIdViolation(
  err: unknown,
  txnId: string,
  opts: TxnIdCheckOptions = {},
): Promise<unknown> {
  if (!isTxnIdUniqueViolation(err)) return err;
  // The transaction is dead, so the admin lookup of the winner uses the global client.
  const existing = opts.revealOrder
    ? await findPaymentByTxnId(prisma, txnId, opts.excludePaymentId)
    : null;
  return duplicateError(existing, opts.revealOrder);
}
