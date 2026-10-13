/**
 * Single source of truth for API error codes and their HTTP statuses.
 * Shared by the server (`AppError`, `statusFromError`) and the client
 * (`apiErrorSchema`), so a new code is added in exactly one place.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TXN_ID_DUPLICATE: 409,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 422,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
