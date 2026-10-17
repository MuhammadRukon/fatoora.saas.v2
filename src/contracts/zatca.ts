import type { EgsStatus, ZatcaEnvironment } from '@prisma/client';
import { z } from 'zod';

export const onboardSchema = z.object({ otp: z.string().trim().regex(/^\d{6}$/, '6 digits') }).strict();
export type OnboardInput = z.input<typeof onboardSchema>;

/** Wire shape of GET /api/app/zatca (never any key material, token or secret). */
export type ZatcaStatusDTO = {
  environment: ZatcaEnvironment;
  egs: { status: EgsStatus; serialNumber: string; certNotAfter: string | null; lastError: string | null } | null;
};

export type OnboardResultDTO = {
  status: EgsStatus;
  errors: string[];
  results: { label: string; httpStatus: number; outcome: string; errors: number; warnings: number; messages: string[] }[];
};
