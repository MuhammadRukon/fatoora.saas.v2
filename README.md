# Cryptech — Gadget E-commerce (Next.js)

A full-stack e-commerce MVP for gadgets/electronics targeting the Bangladesh market. Customers get catalog browsing, search/filters, guest + logged-in cart, checkout with local payment methods (COD, bKash, SSLCommerz, bank transfer), order tracking, verified-purchase reviews, and warranty claims. Admins get a dashboard for catalog, orders, payment verification, coupons, warranty, users, and analytics.

**📚 Full documentation lives in [`docs/`](./docs/context/00-INDEX.md)** — architecture, data model, API reference, known issues, feature roadmap, and SEO audit.

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database & ORM:** PostgreSQL (Prisma-hosted) + Prisma 6
- **Auth:** Auth.js v5 (next-auth) — credentials + Google OAuth, JWT sessions
- **Validation:** Zod contracts shared client/server (`src/contracts/`)
- **State:** TanStack Query (server state) + Zustand (guest cart)
- **Caching:** Next ISR for public catalog pages; optional Upstash Redis (cache + rate limiter), fail-open to Postgres
- **UI:** Tailwind CSS 4 + shadcn/ui (Radix)
- **Media:** Cloudinary
- **Testing:** Vitest (node, DB-backed via `npm test` against the local Postgres; jsdom per file for hooks) + React Testing Library
- **Deployment:** Vercel (free tier) — `main` auto-deploys

## Features

**Customers:** catalog with search/filter/sort/pagination · product variants · guest cart with login merge · address book · coupon codes · checkout quote (shipping rules for Dhaka/outside) · COD / bKash / SSLCommerz / bank transfer · order history with event timeline · self-cancellation · verified-buyer reviews · warranty requests · Google OAuth · password reset

**Admins:** products (variants, images, SEO fields, smart archive-on-delete) · categories (tree) · brands · coupons (percent/fixed, limits, windows) · order management with audit trail · manual payment verification (COD/bank) · warranty workflow · user management · 30-day analytics (revenue, profit, top sellers, low stock)

## Getting Started

```bash
npm ci                      # also runs prisma generate
# create local Postgres databases gadget_dev and gadget_shadow on localhost:5433
# (gadget_shadow is only needed by `npm run db:migrate`, i.e. prisma migrate dev)
copy .env.example .env.dev  # PowerShell/cmd; use `cp` on macOS/Linux. Then fill in the values
npm run db:deploy           # apply migrations to the local gadget_dev
npm run db:seed             # seed admin + demo catalog (set SEED_ADMIN_EMAIL/PASSWORD!)
npm run dev                 # http://localhost:3000
```

Local configuration lives in `.env.dev` (gitignored; variables are listed in [docs/context/01-overview.md](./docs/context/01-overview.md)). See [Local vs production notes](#local-vs-production-notes) before touching `.env` or running anything outside the npm scripts.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack), loads `.env.dev` |
| `npm run build` / `start` | Production build / serve. Plain `build` fails locally by design; see [Local vs production notes](#local-vs-production-notes) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit`. `lint` is currently broken (see [KNOWN-ISSUES](./docs/KNOWN-ISSUES.md#tooling)) |
| `npm run test` / `test:watch` | Vitest, DB-backed: runs against the local `gadget_dev` through the guard. Single file: `npm test -- src/server/common/__tests__/money.test.ts`; single test: `npm test -- -t "free shipping"` |
| `npm run db:deploy` | `prisma migrate deploy` against the local DB |
| `npm run db:migrate` | `prisma migrate dev` after editing `schema.prisma` (requires `SHADOW_DATABASE_URL`; the guard fails if it is unset) |
| `npm run db:status` | `prisma migrate status` |
| `npm run db:seed` / `db:studio` / `db:backfill-email` | Seed DB / Prisma Studio / email-verified backfill |
| `npm run db:guard` | Refuses to continue unless `DATABASE_URL` (and `SHADOW_DATABASE_URL`, if set) point at localhost and the shadow DB differs from the main one |

**How the guard works.** `dev`, `test`, `test:watch` and every `db:*` script load `.env.dev` through `dotenv-cli`. `dev` and every `db:*` script except `db:guard` itself (including `db:status`) also run the localhost guard first through npm `pre` hooks (`predev`, `predb:seed`, ...); `db:migrate` additionally requires `SHADOW_DATABASE_URL`. Tests are guarded by a Vitest `globalSetup` (`vitest.global-setup.ts`) that runs the same check, so `npm test`, `npm test -- <file>`, watch mode and a bare `npx vitest` all abort instead of running against an unchecked database; use `npm test` so `.env.dev` is loaded.

### Local vs production notes

- **Keep `.env` free of database URLs.** This is a local convention, not enforced by the repo (`.env` is untracked), so a command run without the `.env.dev` wrapper fails closed instead of reaching a real database. The guards check the effective environment, whatever file the values came from. **In an existing checkout whose `.env` still contains a production `DATABASE_URL` / `SHADOW_DATABASE_URL`, blank those two values BEFORE running any unwrapped `npx prisma ...` or `npx vitest ...` command.**
- **Local builds.** Plain `npm run build` fails locally when `.env` holds no `DATABASE_URL`; build locally with `npx dotenv -e .env.dev -- next build`. Vercel uses dashboard variables.
- **`NODE_ENV=production` locally.** Running `next build` / `next start` locally sets `NODE_ENV=production`, which changes seed behavior (`prisma/seed.ts` requires `SEED_ADMIN_*` to be set), Auth.js `trustHost` (needs `AUTH_TRUST_HOST=true`) and other dev-only behavior. Don't expect `next start` to behave like `npm run dev`.
- **Production migrations are manual.** Run `prisma migrate deploy` against production by hand: pull the URL from Vercel for that one command in a one-off shell and never store it in a local file. The localhost guard intentionally blocks `npm run db:*` for remote databases.
- **Shell variables win.** `dotenv-cli` does not override variables already set in the shell, so a shell-level `DATABASE_URL` beats `.env.dev`. The guard still catches a non-local value and refuses to run.

## Architecture (short version)

```
UI (src/app, src/modules)  →  API routes (src/app/api/**)  →  Services (src/server/**)  →  Prisma
```

- Contracts-first: Zod schemas in `src/contracts/` validate on the server and type the client.
- Money is integer cents everywhere; order items are snapshotted for historical correctness.
- Payments use a strategy interface (`src/server/payments/`) — providers are pluggable and DB-free.
- Auth guard: `src/proxy.ts` (edge) + `requireAdminSession()` in every admin route + role check in the dashboard layout.
- Public catalog pages are ISR (60-120 s) with on-demand purge on admin writes; Upstash Redis is an optional cache/limiter layer that fails open to Postgres (`UPSTASH_REDIS_REST_URL`/`_TOKEN`, see `.env.example`).

Details: [docs/context/02-architecture.md](./docs/context/02-architecture.md)

## Project Structure

```
prisma/                 # schema, migrations, seed
src/
  app/(public)/         # storefront pages
  app/(dashboard)/      # admin pages
  app/api/              # route handlers (transport layer)
  server/               # business logic: services, repos, common utils
  modules/              # client-side feature modules (hooks + components)
  contracts/            # zod schemas + DTO types
  components/           # shared UI (shadcn + custom)
  lib/                  # prisma client, fetcher, query client
docs/
  context/              # orientation docs (start at 00-INDEX.md)
  KNOWN-ISSUES.md       # verified-open issues, each with a code location
  product/              # feature gaps and scale-up roadmap
  plans/                # active plans (E2E, Redis follow-ups, perf and docs cleanup)
  SEO-AUDIT.md          # SEO state and open items
```

## Git Flow

`main` = production (auto-deploy) · `dev` = integration · `feature/*` from `main`, PR → `dev`, then `dev` → `main`.

## Known Issues & Roadmap

- Open issues (security, correctness, tooling), each with a code location: [docs/KNOWN-ISSUES.md](./docs/KNOWN-ISSUES.md). Read the Security and Correctness sections before taking live online payments.
- What to build next: [docs/product/FEATURE-GAPS.md](./docs/product/FEATURE-GAPS.md)
- Scale-up roadmap (post-success): [docs/product/SCALE-UP-TODO.md](./docs/product/SCALE-UP-TODO.md)
