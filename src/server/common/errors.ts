/**
 * Domain error hierarchy used by the service layer.
 *
 * Services throw these. Transport adapters (Next.js route handlers,
 * server actions, or a future standalone backend) translate them
 * to HTTP responses via `statusFromError` / `toJsonError`.
 */

import { ERROR_STATUS, type ErrorCode } from '@/contracts/errors';

export type { ErrorCode };

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly meta?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', meta?: Record<string, unknown>) {
    super('BAD_REQUEST', message, meta);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('CONFLICT', message, meta);
  }
}

/**
 * A customer transaction id is already attached to another payment (409, with
 * its own code so clients can show specific copy). Not a ConflictError: the
 * code, not the class, is what the wire and the UI key on. Customer-facing
 * throws carry no `meta`; admin throws carry
 * `{ existingOrderId, existingOrderNumber }`.
 */
export class TxnIdDuplicateError extends AppError {
  constructor(message = 'Transaction ID already exists', meta?: Record<string, unknown>) {
    super('TXN_ID_DUPLICATE', message, meta);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', meta?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, meta);
  }
}

export function statusFromError(err: unknown): number {
  return err instanceof AppError ? ERROR_STATUS[err.code] : 500;
}

export interface JsonError {
  code: ErrorCode;
  message: string;
  meta?: Record<string, unknown>;
}

export function toJsonError(err: unknown): JsonError {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, meta: err.meta };
  }
  return { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}
