import { z } from 'zod';
import { WarrantyStatus } from '@prisma/client';

export const submitWarrantySchema = z.object({
  reason: z.string().min(20).max(2000),
});
export type SubmitWarrantyInput = z.infer<typeof submitWarrantySchema>;

export const transitionWarrantySchema = z.object({
  status: z.enum(WarrantyStatus),
  resolution: z.string().max(2000).optional(),
});
export type TransitionWarrantyInput = z.infer<typeof transitionWarrantySchema>;
