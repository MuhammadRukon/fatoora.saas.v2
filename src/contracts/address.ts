import { z } from 'zod';

export const addressInputSchema = z.object({
  recipientName: z.string().min(2).max(100),
  recipientPhone: z.string().min(6).max(20),
  line1: z.string().min(2).max(160),
  line2: z.string().max(160).nullish(),
  city: z.string().min(2).max(60),
  district: z.string().max(60).nullish(),
  postalCode: z.string().max(20).nullish(),
  country: z.string().min(2).max(60),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressInputSchema>;
