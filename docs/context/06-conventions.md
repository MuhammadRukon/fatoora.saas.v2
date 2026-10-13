# Conventions & Workflows

## Adding or changing a feature (contracts-first)

Touch layers in this order:

1. **Contract** — `src/contracts/<domain>.ts`: Zod schema + inferred types. Shared by server validation and client typing.
2. **Service** — `src/server/<domain>/<domain>.service.ts`: business logic. Throw `AppError` subclasses from `src/server/common/errors.ts`; never return raw errors.
3. **Route** — `src/app/api/**/route.ts`: thin — parse contract, `requireSession()`/`requireAdminSession()` as needed, call service, `NextResponse.json`, `catch → jsonError(err)`.
4. **Query key** — `src/constants/queryKeys.ts`: add/extend the key factory.
5. **Hook** — `src/modules/<domain>/hooks.ts`: React Query wrapper using `src/lib/fetcher.ts` (`apiGet`/`apiSend`, throws typed `ApiClientError`).
6. **UI** — `src/modules/<domain>/components/` or page under `src/app`.

Rules of thumb:

- Only `src/server/common/http.ts` imports `next/server` in server-layer code.
- Money is always integer cents; use helpers in `src/server/common/money.ts`.
- Slugs via `src/server/common/slug.ts`.
- Multi-step DB writes go inside `prisma.$transaction` — and pass the `tx` client to any service helpers called within (checkout passes `tx` into coupon validation and pricing).
- Admin writes that change what the storefront shows call `src/app/api/_lib/revalidate.ts` (`revalidateCatalog`, `revalidateProductPage`) after the service call succeeds; that file is the only `next/cache` importer. See [02-architecture.md](./02-architecture.md#caching--isr).
- Cache keys: build them with `buildKey(...)` and hash filters with `stableHash` (`src/server/common/cache.ts`); put a `v1` segment in the key and bump it when the cached DTO shape changes. Redis is fail-open: never make correctness depend on a cache hit, and never put emails, IPs or other PII in a key or value.
- Forms: react-hook-form + `zodResolver` with the same contract schema.
- Toasts via `sonner`; loading states per-component.

## Testing

- Vitest (`npm run test`), config in `vitest.config.ts` (default **node** environment; two projects: `parallel` and `settings-serial` for singleton-mutating tests). A file that needs a DOM (hooks, components) opts into jsdom with a `// @vitest-environment jsdom` docblock, as `src/hooks/__tests__/use-header-search-preview.test.ts` does.
- **Test DB must be local** (`localhost:5433` or configured in `.env.dev`); `vitest.global-setup.ts` aborts on a non-local `DATABASE_URL`/`SHADOW_DATABASE_URL` or a missing `DATABASE_URL`, with no opt-out. Run tests via `npm test` (dotenv-cli loads `.env.dev`, i.e. the local dev DB). Test env blanks `RESEND_API_KEY` and `EMAIL_FROM` to prevent mailer calls.
- Tests cover pure logic, services (live Prisma, not mocked), route handlers (`src/app/api/__tests__`) and a few jsdom hook tests; there is no browser E2E yet. Pattern: pure functions in `src/server/common` are easiest; checkout/payments/orders services use real DB fixtures. Any test touching `placeOrder`, `quote`, `PaymentSettings`, or COD fee logic must be named `*.serial.test.ts` to run serialized (one forked worker); fixture helpers throw if called from non-serial files.
- Single test file: `npm test -- src/server/common/__tests__/money.test.ts`; single test by name: `npm test -- -t "free shipping"`.

## Git flow

- `main` = production (auto-deploys on Vercel). `dev` = integration. `feature/*` branches from `main`, PR into `dev`, then `dev → main` when stable.
- Commit style: `feat:`, `fix:`, `refactor:`, `chore:` (see git log).

## Prisma

- Schema changes: edit `prisma/schema.prisma` → `npm run db:migrate` (`prisma migrate dev`). The shadow DB is wired (`shadowDatabaseUrl = env("SHADOW_DATABASE_URL")`, local `gadget_shadow`) and is needed only by `migrate dev`.
- `migrate dev`, `migrate reset` and `npm run db:seed` are local-only. `db:seed` seeds admin + demo catalog (`prisma/seed.ts`); never run it against production (default admin credentials — see issues). Never run `migrate dev` against shared or production databases.
- Hand-written SQL migrations are applied with `npm run db:deploy` locally (`prisma migrate deploy`); production deploys are manual, see README.
- After a migration or schema change, run `npx prisma generate` to update the client.
- Guard, shell-variable precedence, production migrations and `NODE_ENV=production` caveats: see README "Local vs production notes".

## UI components

- `src/components/ui/*` — shadcn/ui primitives (generated; edit sparingly).
- `src/components/*` — shared app components (data-table, sidebar, nav).
- `src/app/components/*` and `src/app/common/*` — legacy/storefront-specific shared components (header, footer, modal, etc.). Note the duplication between these trees; prefer `src/components` for new shared work.
