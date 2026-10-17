# Conventions & Workflows

## Adding or changing a feature (contracts-first)

Touch layers in this order:

1. **Contract**: `src/contracts/<domain>.ts`, Zod schema + inferred types. Shared by server validation and client typing.
2. **Service**: `src/server/<domain>/<domain>.service.ts`, business logic. Throw `AppError` subclasses from `src/server/common/errors.ts`; never return raw errors.
3. **Route**: `src/app/api/**/route.ts`, thin: parse contract, `requireSession()`/`requireAdminSession()` as needed, call service, `NextResponse.json`, `catch → jsonError(err)`.
4. **Query key**: `src/constants/queryKeys.ts`, add/extend the key factory.
5. **Hook**: `src/modules/<domain>/hooks.ts`, React Query wrapper using `src/lib/fetcher.ts` (`apiGet`/`apiSend`, throws typed `ApiClientError`).
6. **UI**: `src/modules/<domain>/components/` or a page under `src/app`.

Rules of thumb:

- Only `src/server/common/http.ts` imports `next/server` in server-layer code.
- Money is always integer halalas; use `src/server/common/money.ts` (`toHalalas`, `fromHalalas`, `formatSAR`).
- Pagination via `src/server/common/pagination.ts`.
- Multi-step DB writes go inside `prisma.$transaction` and pass the `tx` client to any helper called within.
- Every business-domain query is scoped by `businessId`; ownership is checked server-side on every route.
- Redis is fail-open: never make correctness depend on a cache hit, and never put emails, IPs or other PII in a key or value.
- Forms: react-hook-form + `zodResolver` with the same contract schema. Toasts via `sonner`.

## Testing

- Vitest (`npm run test`), config in `vitest.config.ts` (default **node** environment). A file that needs a DOM opts into jsdom with a `// @vitest-environment jsdom` docblock.
- **Test DB must be local**; `vitest.global-setup.ts` aborts on a non-local `DATABASE_URL`/`SHADOW_DATABASE_URL` or a missing `DATABASE_URL`, with no opt-out. Run tests via `npm test` (dotenv-cli loads `.env.dev`). The test env blanks `RESEND_API_KEY` and `EMAIL_FROM` so nothing is mailed.
- Tests cover pure logic, services (live Prisma, not mocked), route handlers (`src/app/api/__tests__`) and a few jsdom tests; no browser E2E yet.
- Single test file: `npm test -- src/server/common/__tests__/money.test.ts`; single test by name: `npm test -- -t "half-up"`.

## Git flow

See `.claude/skills/git-hygiene/SKILL.md`. `main` = production (auto-deploys on Vercel), `dev` = integration; work branches PR into `dev`. Commit format: `<type>(<scope>): <description>`.

## Prisma

- Schema changes: edit `prisma/schema.prisma` → `npm run db:migrate` (`prisma migrate dev`). The shadow DB (`SHADOW_DATABASE_URL`, local `fatoora_v2_shadow`) is needed only by `migrate dev`.
- `migrate dev`, `migrate reset` and `npm run db:seed` are local-only. `db:seed` upserts the verified admin (and an optional verified demo USER). Never run `migrate dev` against shared or production databases.
- Partial unique indexes and other SQL Prisma cannot express go into the migration SQL by hand.
- After a migration or schema change, run `npx prisma generate` to update the client.

## UI components

- `src/components/ui/*`: shadcn/ui primitives (generated; edit sparingly).
- `src/components/*`: shared app components (data-table, sidebar, nav, confirm-dialog, loader).
