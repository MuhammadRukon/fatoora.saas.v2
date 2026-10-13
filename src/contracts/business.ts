import { SellerIdScheme, ZatcaEnvironment, type Business } from '@prisma/client';
import { z } from 'zod';

/** KSA VAT registration number (TRN): 15 digits, first and last are 3. */
export const VAT_NUMBER_RE = /^3\d{13}3$/;
export const VAT_NUMBER_MESSAGE = '15 digits, starting and ending with 3';

const ARABIC_MESSAGE = 'Must contain Arabic text';

/** Required, trimmed text. */
export const text = (max = 200) => z.string().trim().min(1, 'Required').max(max);

/** Optional form field: an empty input or a missing key is stored as null. */
export const nullable = (schema: z.ZodString) => schema.optional().transform((v) => v || null);

/** Optional Arabic text: empty, or containing at least one Arabic-script character. */
export const optionalArabic = nullable(
  z.string().trim().max(200).regex(/^$|\p{Script=Arabic}/u, ARABIC_MESSAGE),
);

export const countryCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/, 'Two-letter ISO country code, e.g. SA');

/** Letters and digits only (ZATCA rejects other characters in party identifiers). */
export const ALPHANUMERIC_RE = /^[A-Za-z0-9]*$/;

export const businessUpsertSchema = z
  .object({
    nameEn: text(),
    nameAr: text().regex(/\p{Script=Arabic}/u, ARABIC_MESSAGE),
    vatNumber: z.string().trim().regex(VAT_NUMBER_RE, VAT_NUMBER_MESSAGE),
    sellerIdScheme: z.enum(SellerIdScheme),
    sellerIdValue: text(50).regex(ALPHANUMERIC_RE, 'Letters and digits only'),
    street: text(),
    streetAr: optionalArabic,
    buildingNumber: z.string().trim().regex(/^\d{4}$/, '4 digits'),
    additionalNumber: nullable(z.string().trim().regex(/^(\d{4})?$/, '4 digits')),
    district: text(),
    districtAr: optionalArabic,
    city: text(),
    cityAr: optionalArabic,
    postalCode: z.string().trim().regex(/^\d{5}$/, '5 digits'),
    /** Omitted: stays as is (new rows default to SA). */
    countryCode: countryCodeSchema.optional(),
    businessCategory: text(),
    /** Omitted: stays as is (new rows default to SIMULATION). */
    zatcaEnvironment: z.enum(ZatcaEnvironment).optional(),
  })
  .strict();
/** What a client sends (form values). */
export type BusinessUpsertInput = z.input<typeof businessUpsertSchema>;
/** What the service receives after parsing (empty optionals are null). */
export type BusinessUpsertData = z.output<typeof businessUpsertSchema>;

/** Wire shape (dates are ISO strings after JSON serialisation). */
export type BusinessDTO = Omit<Business, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
