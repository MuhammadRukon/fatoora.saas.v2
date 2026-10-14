import { z } from 'zod';

import { ERROR_CODES } from './errors';

/** Characters XML 1.0 forbids (tab, LF and CR are legal): they would make a signed invoice unparseable. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
export const noControlChars = (v: string) => !CONTROL_CHARS_RE.test(v);
/** For single-line fields: also no CR/LF. */
export const singleLine = (v: string) => noControlChars(v) && !/[\r\n]/.test(v);
export const INVALID_CHARS_MESSAGE = 'Contains invalid characters';

export const idSchema = z.string().min(1);

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const cursorPageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
