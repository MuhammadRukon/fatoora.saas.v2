# Known Issues

Verified-open items only, each checked against the code on 2026-10-14. When you fix one, delete its line; when you find one, add it with a code location. Fixed history lives in git, not here.

## Security

- **Health check is static.** `src/app/api/health/route.ts` returns `{ message: 'OK' }` without a DB ping, so it is useless as a readiness probe.

## Architecture

- **Admin user list has no server pagination.** `listAdminUsers` (`src/server/users/users.service.ts`) returns the whole table; `DataTable` paginates client-side.
- **Single ADMIN role, no last-admin guard.** `updateAdminUser` (`src/server/users/users.service.ts`) lets any admin change any role, including their own. (Plan Phase 2 removes role editing from the admin UI.)
- **No connection-pool tuning.** `src/lib/prisma.ts` is the bare singleton; if connection errors appear under burst, set a low `connection_limit` or add Prisma Accelerate.

## Frontend

- **No `loading.tsx` anywhere.** Server pages block with no skeleton.
- **Admin avatars need a remote image host.** `src/app/(dashboard)/dashboard/users/page.tsx` renders `user.image` with `next/image`, but `next.config.ts` allows no remote hosts, so a user with an image URL (for example a Google avatar) breaks that row.

## Tooling

- **`npm run lint` does not work.** `package.json:14` is `next lint`, which Next 16 no longer provides. Running ESLint directly (`npx eslint .`) crashes with a circular-JSON error from `@eslint/eslintrc`, because `eslint.config.mjs:7-13` loads `eslint-config-next` 16 (already a flat config) through `FlatCompat`. Fix is a rewrite of `eslint.config.mjs` plus the script; until then rely on `npm run typecheck` and `npm test`.
- **`npm install` reports audit vulnerabilities**, not triaged.
- **No CI.** There is no `.github/` directory, so nothing runs typecheck, tests or build on a PR.
