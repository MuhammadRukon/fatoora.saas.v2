import { describe, expect, it } from 'vitest';

import {
  AppError,
  BadRequestError,
  ConflictError,
  TxnIdDuplicateError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  statusFromError,
  toJsonError,
} from '../errors';
import { RateLimitedError } from '../rate-limit';
import { apiErrorSchema } from '@/contracts/common';
import { ERROR_STATUS } from '@/contracts/errors';

describe('errors: statusFromError', () => {
  it('maps domain errors to HTTP status codes', () => {
    expect(statusFromError(new BadRequestError())).toBe(400);
    expect(statusFromError(new UnauthorizedError())).toBe(401);
    expect(statusFromError(new ForbiddenError())).toBe(403);
    expect(statusFromError(new NotFoundError())).toBe(404);
    expect(statusFromError(new ConflictError('dup'))).toBe(409);
    expect(statusFromError(new ValidationError())).toBe(422);
    expect(statusFromError(new TxnIdDuplicateError())).toBe(409);
  });

  it('falls back to 500 for unknown errors', () => {
    expect(statusFromError(new Error('boom'))).toBe(500);
    expect(statusFromError('boom')).toBe(500);
  });
});

describe('errors: toJsonError', () => {
  it('serialises AppError with code, message, and meta', () => {
    const err = new ValidationError('Bad input', { field: 'email' });
    expect(toJsonError(err)).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Bad input',
      meta: { field: 'email' },
    });
  });

  it('hides internal error details from clients', () => {
    const out = toJsonError(new Error('database password leaked'));
    expect(out.code).toBe('INTERNAL_ERROR');
    expect(out.message).not.toContain('database password');
  });

  it('preserves the AppError class hierarchy', () => {
    expect(new NotFoundError() instanceof AppError).toBe(true);
  });
});

describe('errors: TxnIdDuplicateError', () => {
  it('is an AppError with its own code (not a ConflictError) and optional meta', () => {
    const err = new TxnIdDuplicateError('dup', { existingOrderId: 'o1', existingOrderNumber: 'T-1' });
    expect(err).toBeInstanceOf(AppError);
    expect(err).not.toBeInstanceOf(ConflictError);
    expect(err.code).toBe('TXN_ID_DUPLICATE');
    expect(toJsonError(err)).toEqual({
      code: 'TXN_ID_DUPLICATE',
      message: 'dup',
      meta: { existingOrderId: 'o1', existingOrderNumber: 'T-1' },
    });
  });

  it('plain ConflictError keeps the CONFLICT code', () => {
    expect(new ConflictError('x').code).toBe('CONFLICT');
  });
});

describe('errors: single code map', () => {
  it('every code in the map is accepted by the client apiErrorSchema', () => {
    for (const code of Object.keys(ERROR_STATUS)) {
      expect(apiErrorSchema.safeParse({ code, message: 'm' }).success).toBe(true);
    }
    expect(apiErrorSchema.safeParse({ code: 'NOPE', message: 'm' }).success).toBe(false);
  });

  it('each error class maps to its mapped status and wire code', () => {
    expect(ERROR_STATUS).toMatchObject({ CONFLICT: 409, TXN_ID_DUPLICATE: 409, RATE_LIMITED: 429 });
    expect(statusFromError(new RateLimitedError(Date.now() + 5000))).toBe(429);
    expect(toJsonError(new TxnIdDuplicateError()).code).toBe('TXN_ID_DUPLICATE');
    expect(toJsonError(new ConflictError('c', { a: 1 }))).toEqual({
      code: 'CONFLICT',
      message: 'c',
      meta: { a: 1 },
    });
  });
});
