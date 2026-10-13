# Known Issues

Verified-open items only, each checked against the code on 2026-10-13. When you fix one, delete its line; when you find one, add it with a code location. Fixed history lives in git, not here.

## Security

- **Media upload trusts the client MIME type and folder.** `src/server/media/media.service.ts:22` checks `file.type` (client-supplied, no magic-byte sniffing); `src/app/api/admin/media/upload/route.ts:13` passes `folder` unsanitized into the Cloudinary path. Admin-only; no rate limit on upload/delete.
- **Health check is static.** `src/app/api/health/route.ts` returns `{ message: 'OK' }` without a DB ping, so it is useless as a readiness probe.

## Correctness

- **Price sort only sorts the current page.** `src/server/catalog/catalog.service.ts:696-708` fetches the page ordered by `createdAt` and sorts those rows in memory (the search path at `:629-641` sorts only the 500 scored candidates). Fix needs a denormalized `minPriceCents` or a SQL aggregate.
- **`minPrice` is dropped when `maxPrice` is also set.** `catalog.service.ts:571-572` spreads two `sellingPriceCents` keys into one object, so the second overwrites the first.
- **Late FAILED/CANCELLED gateway callback double-restocks.** `src/server/payments/payments.service.ts:262-275` restocks the order's items without checking the order status, while `cancelByCustomer`/admin cancel (`src/server/orders/orders.service.ts:185-205`, `cancelOrderInTx`) restock and leave a PENDING gateway payment untouched. Cancel first, then a fail/cancel callback, and stock is added twice. (A late SUCCEEDED callback is handled: payment recorded, order untouched, audit event written, manual refund needed, `payments.service.ts:218-247`.)
- **Coupon `usedCount` is not released on most cancel paths.** Only the orphaned-checkout cleanup decrements it (`src/server/checkout/checkout.service.ts:310-313`); customer cancel (`orders.service.ts:185-205`), admin cancel and payment-failure restock do not.
- **No expiry sweep for stale PENDING orders.** Abandoned bKash/SSLCommerz/bank-transfer orders hold stock until someone cancels them; there is no cron route or `vercel.json` (needs a job runner, see Architecture).
- **Admin `updateProduct` overwrites variant stock with the form value.** `catalog.service.ts:411` (`stock: v.stock`), so an edit form opened before an order lands restores the old count.
- **Warranty transitions discard the acting admin.** `src/server/warranty/warranty.service.ts:71` (`void adminId`).
- **Category tree has no cycle check.** `catalog.service.ts:243` connects any `parentId` (self or descendant) without validation.
- **Negative-margin variants are accepted.** `src/contracts/catalog.ts:64-79` only refines `discountCents <= sellingPriceCents`; `buyingPriceCents > sellingPriceCents` passes and profit analytics go negative.

## Architecture

- **Admin lists have no server pagination.** `ordersService.listAll` (`src/server/orders/orders.service.ts:152`, orders with items and payments) and `listAdminUsers` (`src/server/users/users.service.ts:17`) return whole tables; `DataTable` paginates client-side.
- **Analytics aggregate in memory.** `src/server/analytics/analytics.service.ts:29-64` loads 30 days of order items and distinct customers into the app.
- **No job runner.** Order expiry, low-stock digests and similar need a scheduled tick (Vercel cron or Inngest/Trigger.dev); none exists.
- **Duplicated component trees.** `src/components/*` vs `src/app/components/*` and `src/app/common/*` overlap; new shared work goes in `src/components`.
- **Single ADMIN role, no last-admin guard.** `src/server/users/users.service.ts:65-74` lets any admin change any role, including their own.
- **No connection-pool tuning.** `src/lib/prisma.ts` is the bare singleton; if connection errors appear under burst, set a low `connection_limit` or add Prisma Accelerate.

## Frontend

- **Category page locks the wrong filter.** `src/app/components/listing-pages.tsx:110` passes `brand={category}` to the list page, hiding the Brand filter on category pages.
- **Product image uploader destroys Cloudinary assets before save.** `src/modules/admin/catalog/components/admin-image-uploader.tsx:80-90` calls `/api/admin/media/delete` on removal; only the COD settings card opts out (`deferDelete`, `cod-fee-card.tsx:207`).
- **No `loading.tsx` anywhere.** Server pages (PDP, listings) block with no skeleton.
- **Account pages redirect client-side.** `src/app/(public)/account/*/page.tsx` (for example `orders/page.tsx:20-24`) flash a loader, then `router.replace` from a `useEffect`, instead of being server-gated like `/checkout`.
- **Client lists have no error state.** `src/app/(public)/account/orders/page.tsx:26` renders loading then data only; a failed fetch leaves a stuck loader (the order detail and bank-transfer pages handle `error`).
- **Admin forms show raw cents.** `src/modules/admin/catalog/components/product-form.tsx:452-500` ("Buying price (cents)") and the coupon form take integer cents.

## Tooling

- **`npm run lint` does not work.** `package.json:14` is `next lint`, which Next 16.2.4 no longer provides (it fails with `Invalid project directory ... \lint`). Running ESLint directly (`npx eslint .`) crashes with a circular-JSON error from `@eslint/eslintrc`, because `eslint.config.mjs:6-13` loads `eslint-config-next` 16 (already a flat config) through `FlatCompat`. Fix is a rewrite of `eslint.config.mjs` plus the script; until then rely on `npm run typecheck` and `npm test`.
- **`npm install` reports 37 audit vulnerabilities** (2 low, 4 moderate, 24 high, 7 critical), not triaged (for example `sharp`/libvips advisories).
- **No CI.** There is no `.github/` directory, so nothing runs lint, typecheck, tests or build on a PR (roadmap item in `docs/product/SCALE-UP-TODO.md`).
- **Owner follow-ups carried from the local-dev-environment work** (dashboard and local-machine items, not verifiable from code): keep `DATABASE_URL`/`SHADOW_DATABASE_URL` blank in the untracked `.env` (see README "Local vs production notes"); finish the Vercel Preview vs Production variable scoping and a separate remote dev database (`AUTH_TRUST_HOST=true` on Preview, Preview Deployment Protection check); delete the Cloudinary test asset `gadget-website-dev/products/sfaef8a5oujcllegrwbr`; never accept a `prisma migrate dev` reset prompt against a shared or production database.

## Owner follow-ups from the Redis/ISR work

- Take the production measurements: Prisma "Total Operations" per home/category/PDP view, Vercel function invocations per session, and note the Prisma Postgres region and Vercel plan (plan: `docs/plans/redis-caching-strategy-plan.md`, Phase 0).
- Create the Upstash database (Singapore), set `UPSTASH_REDIS_REST_URL`/`_TOKEN` in Vercel production and preview, set a budget cap and an 80% alert. Until then Redis stays off and the app uses Postgres fallbacks.
- Drop the leftover formatter stash: `git stash drop` the entry `exec-cart-format-churn` (`git stash list` shows it as `stash@{0}` today; find it by name, the index moves).
- Trim `docs/plans/redis-caching-strategy-plan.md` into a short "Caching decisions" doc once the items above are recorded.
