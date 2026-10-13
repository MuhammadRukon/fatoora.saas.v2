import { BuyerIdScheme, type Customer } from '@prisma/client';
import { z } from 'zod';

import {
  ALPHANUMERIC_RE,
  VAT_NUMBER_MESSAGE,
  countryCodeSchema,
  nullable,
  optionalArabic,
  text,
} from './business';
import { paginationQuerySchema } from './common';

const optionalText = (max = 200) => nullable(z.string().trim().max(max));

export const customerInputSchema = z
  .object({
    name: text(),
    nameAr: optionalArabic,
    vatNumber: nullable(z.string().trim().regex(/^(3\d{13}3)?$/, VAT_NUMBER_MESSAGE)),
    buyerIdScheme: z
      .union([z.enum(BuyerIdScheme), z.literal('')])
      .optional()
      .transform((v) => v || null),
    buyerIdValue: nullable(z.string().trim().max(50).regex(ALPHANUMERIC_RE, 'Letters and digits only')),
    street: optionalText(),
    buildingNumber: nullable(z.string().trim().regex(/^(\d{4})?$/, '4 digits')),
    additionalNumber: nullable(z.string().trim().regex(/^(\d{4})?$/, '4 digits')),
    district: optionalText(),
    city: optionalText(),
    postalCode: nullable(z.string().trim().regex(/^(\d{5})?$/, '5 digits')),
    /** Omitted: stays as is (new rows default to SA). */
    countryCode: countryCodeSchema.optional(),
    email: nullable(
      z
        .string()
        .trim()
        .max(200)
        .refine((v) => !v || z.email().safeParse(v).success, 'Invalid email'),
    ),
    phone: optionalText(30),
  })
  .strict()
  .superRefine((c, ctx) => {
    // A VAT-registered buyer is identified by its VAT number alone; other IDs are for the rest.
    if (c.vatNumber && (c.buyerIdScheme || c.buyerIdValue)) {
      ctx.addIssue({
        code: 'custom',
        path: ['buyerIdScheme'],
        message: 'Leave the buyer ID empty when a VAT number is set',
      });
    } else if (!c.buyerIdScheme !== !c.buyerIdValue) {
      ctx.addIssue({
        code: 'custom',
        path: [c.buyerIdScheme ? 'buyerIdValue' : 'buyerIdScheme'],
        message: 'Enter both the ID type and the ID number',
      });
    }
  });
/** Create and PATCH both take the full form (the cross-field rule needs every field). */
export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerData = z.output<typeof customerInputSchema>;

export const customerListQuerySchema = paginationQuerySchema.extend({
  /** Matches name, Arabic name or VAT number. */
  q: z.string().trim().max(100).optional(),
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export type CustomerDTO = Omit<Customer, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
