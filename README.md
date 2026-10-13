# Fatoora — ZATCA e-invoicing SaaS (Next.js)

A multi-tenant ZATCA Phase 2 e-invoicing SaaS for businesses in Saudi Arabia. Users sign up, verify their email and request a plan (no payment); an admin activates it. They then set up their business, onboard an EGS unit with ZATCA, manage customers, and issue standard and simplified invoices and credit/debit notes that are signed, hash-chained and reported to or cleared by ZATCA.

The build is phased; see [`docs/plans/fatoora-saas-v2-plan.md`](./docs/plans/fatoora-saas-v2-plan.md). Today the app has auth (signup, email verification, login, password reset), the admin dashboard shell and admin user management.

**Full documentation lives in [`docs/`](./docs/context/00-INDEX.md)**: architecture, data model, API reference, known issues.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database & ORM:** PostgreSQL (Prisma-hosted in production) + Prisma 6
- **Auth:** Auth.js v5 (next-auth): credentials + Google OAuth, JWT sessions
- **Validation:** Zod contracts shared client/server (`src/contracts/`)
- **State:** TanStack Query (server state)
- **Rate limiting:** Postgres-backed, with optional Upstash Redis that fails open to Postgres
- **UI:** Tailwind CSS 4 + shadcn/ui (Radix)
- **Email:** Resend (optional; logs and skips when unset)
- **Testing:** Vitest (node, DB-backed via `npm test` against the local Postgres; jsdom per file) + React Testing Library
- **Deployment:** Vercel: `main` auto-deploys

## Getting Started

```bash
npm ci                      # also runs prisma generate
# create local Postgres databases fatoora_v2 and fatoora_v2_shadow on localhost:5433
# (fatoora_v2_shadow is only needed by `npm run db:migrate`, i.e. prisma migrate dev)
copy .env.example .env.dev  # PowerShell/cmd; use `cp` on macOS/Linux. Then fill in the values
npm run db:deploy           # apply migrations to the local fatoora_v2
npm run db:seed             # seed the verified admin (set SEED_ADMIN_EMAIL/PASSWORD!)
npm run dev                 # http://localhost:3000
```

Local configuration lives in `.env.dev` (gitignored; variables are listed in [docs/context/01-overview.md](./docs/context/01-overview.md)). `ZATCA_ENCRYPTION_KEY` must be base64 of 32 bytes (`openssl rand -base64 32`). See [Local vs production notes](#local-vs-production-notes) before touching `.env` or running anything outside the npm scripts.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack), loads `.env.dev` |
| `npm run build` / `start` | Production build / serve. Plain `build` fails locally by design; see [Local vs production notes](#local-vs-production-notes) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`. `lint` is currently broken (see [KNOWN-ISSUES](./docs/KNOWN-ISSUES.md#tooling)) |
| `npm run test` / `test:watch` | Vitest, DB-backed: runs against the local `fatoora_v2` through the guard. Single file: `npm test -- src/server/common/__tests__/money.test.ts`; single test: `npm test -- -t "half-up"` |
| `npm run db:deploy` | `prisma migrate deploy` against the local DB |
| `npm run db:migrate` | `prisma migrate dev` after editing `schema.prisma` (requires `SHADOW_DATABASE_URL`; the guard fails if it is unset) |
| `npm run db:status` | `prisma migrate status` |
| `npm run db:seed` / `db:studio` | Seed DB / Prisma Studio |
| `npm run db:guard` | Refuses to continue unless `DATABASE_URL` (and `SHADOW_DATABASE_URL`, if set) point at localhost and the shadow DB differs from the main one |

**How the guard works.** `dev`, `test`, `test:watch` and every `db:*` script load `.env.dev` through `dotenv-cli`. `dev` and every `db:*` script except `db:guard` itself (including `db:status`) also run the localhost guard first through npm `pre` hooks (`predev`, `predb:seed`, ...); `db:migrate` additionally requires `SHADOW_DATABASE_URL`. Tests are guarded by a Vitest `globalSetup` (`vitest.global-setup.ts`) that runs the same check, so `npm test`, `npm test -- <file>`, watch mode and a bare `npx vitest` all abort instead of running against an unchecked database; use `npm test` so `.env.dev` is loaded.

### Local vs production notes

- **Keep `.env` free of database URLs.** This is a local convention, not enforced by the repo (`.env` is untracked), so a command run without the `.env.dev` wrapper fails closed instead of reaching a real database. The guards check the effective environment, whatever file the values came from. **If a `.env` contains a production `DATABASE_URL` / `SHADOW_DATABASE_URL`, blank those two values BEFORE running any unwrapped `npx prisma ...` or `npx vitest ...` command.**
- **Local builds.** Plain `npm run build` fails locally when `.env` holds no `DATABASE_URL`; build locally with `npx dotenv -e .env.dev -- next build`. Vercel uses dashboard variables.
- **`NODE_ENV=production` locally.** Running `next build` / `next start` locally sets `NODE_ENV=production`, which requires `CRON_SECRET`, changes seed behavior (`prisma/seed.ts` requires `SEED_ADMIN_*` to be set), Auth.js `trustHost` (needs `AUTH_TRUST_HOST=true`) and other dev-only behavior. Don't expect `next start` to behave like `npm run dev`.
- **Production migrations are manual.** Run `prisma migrate deploy` against production by hand: pull the URL from Vercel for that one command in a one-off shell and never store it in a local file. The localhost guard intentionally blocks `npm run db:*` for remote databases.
- **Shell variables win.** `dotenv-cli` does not override variables already set in the shell, so a shell-level `DATABASE_URL` beats `.env.dev`. The guard still catches a non-local value and refuses to run.

## Architecture (short version)

```
UI (src/app, src/modules)  →  API routes (src/app/api/**)  →  Services (src/server/**)  →  Prisma
```

- Contracts-first: Zod schemas in `src/contracts/` validate on the server and type the client.
- Money is integer halalas (SAR) everywhere.
- Auth guard: `src/proxy.ts` (edge) + `requireAdminSession()` in every admin route + role check in the dashboard layout.
- ZATCA secrets and private keys are stored AES-256-GCM-encrypted; issued documents are immutable; ICV/PIH are allocated under a row lock.

Details: [docs/context/02-architecture.md](./docs/context/02-architecture.md)

## Project Structure

```
prisma/                 # schema, migrations, seed
src/
  app/(public)/         # landing and auth pages
  app/(dashboard)/      # admin pages
  app/api/              # route handlers (transport layer)
  server/               # business logic: services, common utils
  modules/              # client-side feature modules (hooks + components)
  contracts/            # zod schemas + DTO types
  components/           # shared UI (shadcn + custom)
  lib/                  # prisma client, fetcher, query client
docs/
  context/              # orientation docs (start at 00-INDEX.md)
  KNOWN-ISSUES.md       # verified-open issues, each with a code location
  plans/                # the phased build plan
```

## Git Flow

`main` = production (auto-deploy) · `dev` = integration · work branches PR → `dev`, then `dev` → `main`. Details: `.claude/skills/git-hygiene/SKILL.md`.
