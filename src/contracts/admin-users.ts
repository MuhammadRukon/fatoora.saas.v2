import { UserRole } from '@prisma/client';
import { z } from 'zod';

const nullablePhoneSchema = z.union([z.string().min(6).max(20), z.literal(''), z.null()]);
const nullableImageSchema = z.union([z.string().url(), z.literal(''), z.null()]);
const optionalPasswordSchema = z.union([z.string().min(8).max(72), z.literal('')]).optional();

export const adminUserCreateSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  phone: nullablePhoneSchema,
  image: nullableImageSchema,
  role: z.enum(UserRole),
  password: optionalPasswordSchema,
});
export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;

export const adminUserUpdateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: nullablePhoneSchema,
  image: nullableImageSchema,
  role: z.enum(UserRole),
});
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
