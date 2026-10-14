import { z } from 'zod';

/**
 * Central, fail-fast environment validation. Only variables that must be
 * present for the server to boot correctly are required; optional provider
 * credentials stay optional because their absence is a legitimate dev mode
 * (e.g. the mailer logs instead of sending).
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1),
    NEXTAUTH_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    // AES-256-GCM key for ZATCA secrets and private keys at rest.
    // Generate with: openssl rand -base64 32
    ZATCA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32,
        'must be base64 of exactly 32 bytes',
      ),
    // Bearer secret for Vercel Cron calls; required in production only.
    CRON_SECRET: z.string().min(1).optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    // Transactional email (Resend). Optional: absence = mailer logs and
    // skips instead of sending (dev/test mode) — see src/server/common/mailer.ts.
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    // Upstash Redis (REST). Optional: absence = cache/limiter layer disabled and
    // the app falls back to DB-backed behavior; see src/server/common/cache.ts.
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.CRON_SECRET, {
    message: 'CRON_SECRET is required in production',
    path: ['CRON_SECRET'],
  })
  // Without a mailer, verification secrets would have nowhere to go; fail at boot instead.
  .refine((e) => e.NODE_ENV !== 'production' || !!e.RESEND_API_KEY, {
    message: 'RESEND_API_KEY is required in production',
    path: ['RESEND_API_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.EMAIL_FROM, {
    message: 'EMAIL_FROM is required in production',
    path: ['EMAIL_FROM'],
  });

export const env = schema.parse(process.env);
