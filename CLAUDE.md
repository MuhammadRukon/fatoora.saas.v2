# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Fatoora": a multi-tenant ZATCA Phase 2 e-invoicing SaaS for Saudi businesses. Users sign up, verify their email and request a plan (1/3/6/12 months, no payment); an admin activates it manually. Users then create a business profile, onboard an EGS unit with ZATCA (Simulation or Production) via OTP, manage customers, and issue standard (B2B) and simplified (B2C) invoices and credit/debit notes that are signed, hash-chained, carry a QR (TLV tags 1-9), and are reported to or cleared by ZATCA. The phased build plan is `docs/plans/fatoora-saas-v2-plan.md`.

Next.js 16 App Router + React 19 + TypeScript, Prisma + PostgreSQL, Auth.js v5 (JWT sessions), TanStack Query, Tailwind 4 + shadcn/ui, Resend email, Vitest.

Hosted on Vercel + Prisma-hosted Postgres. Cost-sensitive: free tier first, prefer DB-backed solutions over paid infra. Upstash Redis (REST) is an **optional, fail-open** limiter layer (`src/server/common/cache.ts`), enabled by `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`; with them unset or Redis failing, rate limiting uses the Postgres `RateLimitBucket`.

## Commands

```bash
npm run dev          # Turbopack dev server on :3000 (loads .env.dev)
npm run build        # production build (Vercel); fails locally by design, see below
npm run lint         # currently broken (see docs/KNOWN-ISSUES.md, Tooling); rely on typecheck + tests
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (loads .env.dev)
npm run test:watch
npm run db:seed      # tsx prisma/seed.ts — verified admin (+ optional demo user); local-only
npm run db:studio
npm run db:migrate   # prisma migrate dev after editing prisma/schema.prisma (requires SHADOW_DATABASE_URL); local-only
npm run db:deploy    # prisma migrate deploy against the local DB; local-only
npm run db:status    # prisma migrate status
```

These scripts load `.env.dev` and run a localhost guard that refuses non-local database URLs (`db:*` and `dev` via npm `pre` hooks; tests via the Vitest `globalSetup`), and `npm test` is DB-backed against the local `fatoora_v2`. Plain `npm run build` fails locally; build with `npx dotenv -e .env.dev -- next build`. See README "Local vs production notes" for the `.env` convention, production migrations and `NODE_ENV=production` caveats.

Single test file / single test:

```bash
npm test -- src/server/common/__tests__/money.test.ts
npm test -- -t "half-up"
```

Vitest runs in the **node** environment by default (`vitest.config.ts`); a file opts into jsdom with a `// @vitest-environment jsdom` docblock. It only picks up `src/**/*.{test,spec}.{ts,tsx}`. Tests use explicit imports (`globals: false`) — import `describe`/`it`/`expect` from `vitest`.

`src/env.ts` fail-fast validates env at boot via `instrumentation.ts`; a missing required var crashes the server rather than failing later. `ZATCA_ENCRYPTION_KEY` (base64 of 32 bytes) is always required, `CRON_SECRET` in production. Copy `.env.example` to `.env.dev` for local work (production values live only in the Vercel dashboard).

## Architecture

```
UI (src/app pages, src/modules components+hooks)
  → API route handlers (src/app/api/**)     transport only: parse Zod contract, auth check, delegate
    → Services (src/server/<domain>/*.service.ts)   business logic, framework-agnostic
      → Prisma (src/lib/prisma.ts)
```

Key invariants:

- **`src/server/common/http.ts` is the only server-layer file allowed to import `next/server`.** It owns `requireSession()`, `requireAdminSession()`, `jsonError()`. Services must stay free of Next imports.
- Errors: throw `AppError` subclasses from `src/server/common/errors.ts`; routes `catch → jsonError(err)`, which maps `ErrorCode` (from `src/contracts/errors.ts`) to HTTP status and special-cases `RateLimitedError` (429 + Retry-After) and `ZodError` (422).
- **Money is integer halalas (1 SAR = 100) everywhere.** Never floats. Helpers in `src/server/common/money.ts` (`toHalalas` parses decimal strings exactly with half-up rounding, `fromHalalas`, `formatSAR`). Prices are entered VAT-exclusive.
- Services call Prisma directly; there is no repo layer.
- Multi-step DB writes go inside `prisma.$transaction` and must pass the `tx` client to any helper called within.

### ZATCA rules (non-negotiable)

- Validate at every trust boundary: a Zod contract on every API input.
- Scope every query by `businessId`, and check ownership server-side on every route (another business's id is a 404, not a 403).
- Store ZATCA secrets and private keys encrypted with AES-256-GCM (`ZATCA_ENCRYPTION_KEY`). Never return them to the client or log them.
- An issued document is never mutated; a correction is a new document. A rejected document burns its UUID and ICV.
- Allocate ICV and PIH under a row lock in one transaction. ICV increments per EGS unit with no gaps and is never reset.
- Errors must never lose a signed document: persist it before any network call.
- ZATCA crypto lives in `src/server/zatca/` as pure Node functions (no Prisma, no Next, no network). Never re-serialize XML after signing.
- Gregorian dates only; human-readable output must be in Arabic (RTL-correct print view).
- ZATCA environments are `SIMULATION | PRODUCTION` per business (default `SIMULATION`). The developer-portal sandbox is not supported.
- Accessibility: shadcn/Radix defaults, labelled form fields, keyboard-reachable actions.

### Contracts-first workflow

Adding or changing a feature touches layers in this order:

1. `src/contracts/<domain>.ts` — Zod schema + inferred types (shared: server validation *and* client typing).
2. `src/server/<domain>/<domain>.service.ts` — business logic.
3. `src/app/api/**/route.ts` — thin handler.
4. `src/constants/queryKeys.ts` — add/extend the key factory (keeps cache keys from drifting).
5. `src/modules/<domain>/hooks.ts` — React Query wrapper over `src/lib/fetcher.ts` (`apiGet`/`apiSend`, throws typed `ApiClientError`).
6. UI in `src/modules/<domain>/components/` or a page under `src/app`.

Forms use react-hook-form + `zodResolver` with the *same* contract schema. Toasts via `sonner`.

### Auth & RBAC (three layers, all required)

- Roles are the `UserRole` enum `{ADMIN, USER}`. Signup creates `USER`; admins are seed-created.
- `src/auth.ts` instantiates Auth.js v5 from `src/server/auth/authOptions.ts`. **JWT strategy** — `id` and `role` are baked into the token at sign-in, so role changes only apply after the token refreshes. Credentials login is refused until `emailVerified` is set.
- `src/proxy.ts` — Next 16's middleware file (named `proxy.ts`, not `middleware.ts`). Verifies the JWT and role at the edge for `/dashboard/*` and `/api/admin/*`, and a session for `/app/*`, `/plans`, `/api/app/*` and `/api/subscriptions/*`. Fast-fail only.
- **Enforcement of record**: every `/api/admin/**` route calls `requireAdminSession()`, and `(dashboard)/layout.tsx` re-checks `role === 'ADMIN'` server-side. Every `/api/app/**` route calls `requireAppSession()` (USER with an ACTIVE subscription, else 402 `SUBSCRIPTION_REQUIRED`), and `(app)/app/layout.tsx` redirects to `/plans` unless ACTIVE. **Exception (read-only for EXPIRED)**: the GET routes over issued records (`/api/app/documents`, `/[id]`, `/[id]/xml`) use `requireBusinessReadContext()`, which also admit an EXPIRED subscription (had a plan once, none now); the layout lets EXPIRED open only `/app/invoices`, `/app/invoices/[id]` and its `/print` (path forwarded by `proxy.ts` as `x-pathname`, rule in `src/lib/app-access.ts`) with a read-only banner and no write buttons. All writes stay 402, and NONE/PENDING stay fully gated. Never rely on the edge guard alone.

## Conventions

- Path alias `@/*` maps to `src/*`.
- Pagination via `src/server/common/pagination.ts`.
- Rate limiting (`src/server/common/rate-limit.ts`) is Postgres-backed via the `RateLimitBucket` model so it works across serverless instances; Redis is an optional layer on top (250 ms timeout) and any Redis failure falls back to Postgres. Applied to login, signup, forgot, reset, verify, resend-verify and change-password.
- Mailer (`src/server/common/mailer.ts`) uses Resend; with `RESEND_API_KEY` unset it logs and skips instead of sending (and, outside production, signup returns a `devCode`); both `RESEND_API_KEY` and `EMAIL_FROM` are required when `NODE_ENV=production`. **Test env blanks these vars** to prevent actual sends during test runs.
- Component trees: `src/components/ui/*` are generated shadcn primitives (edit sparingly), `src/components/*` are shared app components.
- Tests: Vitest runs in the **node** environment via `vitest.config.ts`. **Test DB must be local**; `vitest.global-setup.ts` aborts on a non-local `DATABASE_URL`/`SHADOW_DATABASE_URL` or a missing `DATABASE_URL`, with no opt-out; run tests via `npm test` (dotenv-cli loads `.env.dev`). Pure functions in `src/server/common` are the easiest targets. Route-level tests live in `src/app/api/__tests__`; there is no browser E2E yet.

## Git flow

`main` = production (auto-deploys on Vercel), `dev` = integration. `feature/*` branches from `main`, PR into `dev`, then `dev` into `main`. Commit format: `<type>(<scope>): <description>` (see `.claude/skills/git-hygiene/SKILL.md`).

## Docs

`docs/context/00-INDEX.md` is the orientation hub — overview/env, architecture, data model, API reference, frontend map, conventions. `docs/KNOWN-ISSUES.md` lists verified-open issues with code locations. `docs/plans/` holds the active plan.

The context docs are checked against the code, but they can still lag it. Verify a specific claim in source before relying on it, and update the matching doc in the same change.
