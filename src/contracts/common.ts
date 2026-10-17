import { type BuyerIdScheme } from '@prisma/client';
import { z } from 'zod';

import { ERROR_CODES } from './errors';

/** Characters XML 1.0 forbids (tab, LF and CR are legal): they would make a signed invoice unparseable. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;
export const noControlChars = (v: string) => !CONTROL_CHARS_RE.test(v);
/** For single-line fields: also no CR/LF. */
export const singleLine = (v: string) => noControlChars(v) && !/[\r\n]/.test(v);
export const INVALID_CHARS_MESSAGE = 'Contains invalid characters';

export const ARABIC_MESSAGE = 'Must contain Arabic text';

/** Required, trimmed text. */
export const text = (max = 200) => z.string().trim().min(1, 'Required').max(max).refine(singleLine, INVALID_CHARS_MESSAGE);

/** Optional field: empty, null or missing is stored as null (null in: parsed form output round-trips). */
export const nullable = (schema: z.ZodString, multiline = false) =>
  schema
    .nullish()
    .refine((v) => !v || (multiline ? noControlChars(v) : singleLine(v)), INVALID_CHARS_MESSAGE)
    .transform((v) => v || null);

/** Optional Arabic text: empty, or containing at least one Arabic-script character. */
export const optionalArabic = nullable(
  z.string().trim().max(200).regex(/^$|\p{Script=Arabic}/u, ARABIC_MESSAGE),
);

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Two-letter ISO country code, e.g. SA');

/** Letters and digits only (ZATCA rejects other characters in party identifiers). */
export const ALPHANUMERIC_RE = /^[A-Za-z0-9]*$/;

/** Display labels for ZATCA party ID schemes (sellers use the subset in SellerIdScheme). */
export const ID_SCHEME_LABELS: Record<BuyerIdScheme, string> = {
  TIN: 'Tax identification number',
  CRN: 'Commercial registration (CRN)',
  MOM: 'MOMRAH license',
  MLS: 'MHRSD license',
  S700: '700 number',
  SAG: 'MISA license',
  NAT: 'National ID',
  GCC: 'GCC ID',
  IQA: 'Iqama',
  PAS: 'Passport',
  OTH: 'Other ID',
};

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
