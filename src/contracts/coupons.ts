import { z } from 'zod';
import { CouponType } from '@prisma/client';

/**
 * Form-side schema. Dates are real `Date` objects so react-hook-form's
 * resolver type matches the form values cleanly.
 */
export const couponInputSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/, 'Use only uppercase letters, digits, dashes, or underscores'),
    type: z.enum(CouponType),
    /** For PERCENT this is 1..100. For FIXED this is cents (>= 1). */
    value: z.number().int().min(1),
    minSubtotalCents: z.number().int().min(0).optional(),
    maxDiscountCents: z.number().int().min(0).nullable().optional(),
    startsAt: z.date().nullable().optional(),
    expiresAt: z.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perUserLimit: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => (v.type === CouponType.PERCENT ? v.value <= 100 : true),
    { message: 'Percentage must be 1-100', path: ['value'] },
  )
  .refine(
    (v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt,
    { message: 'expiresAt must be after startsAt', path: ['expiresAt'] },
  );
export type CouponInput = z.infer<typeof couponInputSchema>;

/**
 * Wire-side schema used by API routes. JSON serialisation turns Date
 * into ISO string, so we coerce here. The shape is structurally
 * compatible with `CouponInput`.
 */
export const couponWireSchema = z
  .object({
    code: z.string().min(3).max(40),
    type: z.enum(CouponType),
    value: z.number().int().min(1),
    minSubtotalCents: z.number().int().min(0).optional(),
    maxDiscountCents: z.number().int().min(0).nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    usageLimit: z.number().int().min(1).nullable().optional(),
    perUserLimit: z.number().int().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (v) => (v.type === CouponType.PERCENT ? v.value <= 100 : true),
    { message: 'Percentage must be 1-100', path: ['value'] },
  )
  .refine(
    (v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt,
    { message: 'expiresAt must be after startsAt', path: ['expiresAt'] },
  );
export type CouponWireInput = z.infer<typeof couponWireSchema>;
