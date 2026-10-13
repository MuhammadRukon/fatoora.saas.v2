import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { TxnIdDuplicateError } from '@/server/common/errors';

import { isTxnIdUniqueViolation, mapTxnIdViolation } from '../txn-id';

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('boom', { code, clientVersion: 'test', meta });
}

describe('isTxnIdUniqueViolation', () => {
  it('is true for a P2002 whose target field list includes customerTxnId', () => {
    expect(
      isTxnIdUniqueViolation(
        knownError('P2002', { modelName: 'Payment', target: ['customerTxnId'] }),
      ),
    ).toBe(true);
  });

  it('is true for a P2002 whose target is the constraint name', () => {
    expect(
      isTxnIdUniqueViolation(knownError('P2002', { target: 'Payment_customerTxnId_key' })),
    ).toBe(true);
  });

  it('is true for the driver-adapter shape (constraint fields or index)', () => {
    const adapter = (constraint: unknown) =>
      knownError('P2002', {
        driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint } },
      });
    expect(isTxnIdUniqueViolation(adapter({ fields: ['customerTxnId'] }))).toBe(true);
    expect(isTxnIdUniqueViolation(adapter({ index: 'Payment_customerTxnId_key' }))).toBe(true);
    expect(isTxnIdUniqueViolation(adapter({ fields: ['orderNumber'] }))).toBe(false);
  });

  it('is false for a P2002 on another field or constraint', () => {
    expect(isTxnIdUniqueViolation(knownError('P2002', { target: ['orderNumber'] }))).toBe(false);
    expect(isTxnIdUniqueViolation(knownError('P2002', { target: 'Order_orderNumber_key' }))).toBe(
      false,
    );
    expect(isTxnIdUniqueViolation(knownError('P2002', { target: ['providerRef'] }))).toBe(false);
    expect(isTxnIdUniqueViolation(knownError('P2002'))).toBe(false);
    expect(isTxnIdUniqueViolation(knownError('P2002', { target: null }))).toBe(false);
  });

  it('is false for other error codes and non-Prisma errors', () => {
    expect(isTxnIdUniqueViolation(knownError('P2025', { target: ['customerTxnId'] }))).toBe(false);
    expect(isTxnIdUniqueViolation(new Error('customerTxnId'))).toBe(false);
    expect(isTxnIdUniqueViolation(undefined)).toBe(false);
  });
});

describe('mapTxnIdViolation', () => {
  it('maps a customerTxnId violation to a TxnIdDuplicateError without meta', async () => {
    const mapped = await mapTxnIdViolation(
      knownError('P2002', { target: ['customerTxnId'] }),
      'TXN123',
    );
    expect(mapped).toBeInstanceOf(TxnIdDuplicateError);
    expect((mapped as TxnIdDuplicateError).meta).toBeUndefined();
  });

  it('maps a constraint-name target the same way', async () => {
    const mapped = await mapTxnIdViolation(
      knownError('P2002', { target: 'Payment_customerTxnId_key' }),
      'TXN123',
    );
    expect(mapped).toBeInstanceOf(TxnIdDuplicateError);
  });

  it('returns the original error for a P2002 on another target', async () => {
    const err = knownError('P2002', { target: ['orderNumber'] });
    expect(await mapTxnIdViolation(err, 'TXN123')).toBe(err);
  });

  it('returns the original error when it is not a P2002', async () => {
    const prismaErr = knownError('P2025');
    const plain = new Error('x');
    expect(await mapTxnIdViolation(prismaErr, 'TXN123')).toBe(prismaErr);
    expect(await mapTxnIdViolation(plain, 'TXN123')).toBe(plain);
  });
});
