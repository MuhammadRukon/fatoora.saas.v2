# Project Overview

## What this is

**Fatoora**: a multi-tenant ZATCA Phase 2 e-invoicing SaaS. A user signs up and verifies their email, requests a plan (1, 3, 6 or 12 months; no payment), and an admin activates it. The user then sets up a business profile, onboards an EGS unit with ZATCA (Simulation or Production), manages customers, and issues standard (B2B) and simplified (B2C) invoices plus credit/debit notes that are signed, hash-chained, carry a QR, and are reported to or cleared by ZATCA.

Current state (after plan Phase 1): auth (signup, email verification, login, password reset), the admin dashboard shell and admin user management. Subscriptions, businesses, documents and ZATCA arrive in later phases of [`docs/plans/fatoora-saas-v2-plan.md`](../plans/fatoora-saas-v2-plan.md).

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Database | PostgreSQL (Prisma-hosted in production) via Prisma ORM 6 |
| Auth | Auth.js v5 beta (next-auth): JWT strategy, credentials + Google OAuth |
| Validation | Zod 4 contracts shared client/server (`src/contracts/`) |
| Server state | TanStack Query 5 |
| UI | Tailwind CSS 4 + shadcn/ui (Radix), lucide/tabler icons, sonner toasts |
| Email | Resend HTTP API (`src/server/common/mailer.ts`), optional |
| Limiter | Postgres `RateLimitBucket`, optional Upstash Redis (REST) on top |
| Tables | TanStack Table |
| Testing | Vitest (node; live local Postgres for service tests; jsdom per file) + React Testing Library |
| Analytics | Vercel Analytics |
| Deployment | Vercel: `main` auto-deploys |

## Hosting and cost constraints

- **Vercel**: serverless functions, no shared memory between invocations (limiters are Postgres/Redis-backed), cold starts. Hobby cron runs daily only.
- **Prisma-hosted Postgres**: connection limits apply; keep query counts low.
- **Design rule**: prefer solutions that stay on free tiers before anything paid.

## Environment variables

Local values live in `.env.dev` (gitignored); copy `.env.example` to `.env.dev` to start. Production values live only in the Vercel dashboard. `src/env.ts` validates them at boot (via `instrumentation.ts`).

| Group | Variables |
| --- | --- |
| App | `APP_NAME`, `APP_DEFAULT_FROM_EMAIL`, `NEXT_PUBLIC_APP_URL` (required) |
| Database | `DATABASE_URL` (required), `SHADOW_DATABASE_URL` (only for `prisma migrate dev`) |
| Auth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (required), `AUTH_TRUST_HOST`, optional `AUTH_SECRET` (fallback read in `src/proxy.ts`) |
| ZATCA | `ZATCA_ENCRYPTION_KEY` (required; base64 of exactly 32 bytes, AES-256-GCM key for ZATCA secrets and private keys) |
| Cron | `CRON_SECRET` (required in production; bearer secret for the Vercel Cron retry route) |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (provider only registers if both present) |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` (optional; either unset = mailer logs and skips) |
| Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (optional; unset = Redis layer off, DB fallbacks) |
| Seed | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (required under `NODE_ENV=production`; dev falls back to defaults), optional `SEED_USER_EMAIL`, `SEED_USER_PASSWORD` (demo USER) |

## Scripts

The scripts table, guard behavior and local build command live in the README ([Scripts](../../README.md#scripts), [Local vs production notes](../../README.md#local-vs-production-notes)). `postinstall` runs `prisma generate`.
