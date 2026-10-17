import { ConflictError } from '@/server/common/errors';

/** Prisma date columns hold UTC midnight; these convert to and from "YYYY-MM-DD". */
export const dayString = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
export const dayDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

export const immutableError = () =>
  new ConflictError('Issued documents cannot be changed (DOCUMENT_IMMUTABLE)', { code: 'DOCUMENT_IMMUTABLE' });
