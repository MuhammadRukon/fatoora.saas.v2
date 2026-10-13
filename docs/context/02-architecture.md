# Architecture

## Layering

```
UI (src/app pages, src/modules components/hooks)
  → API route handlers (src/app/api/**)        — transport: parse Zod contract, auth check, delegate
    → Services (src/server/<domain>/*.service)  — business logic
      → Prisma (src/lib/prisma.ts)              — data access (only catalog and reviews have repos)
```

- `src/server/common/http.ts` is the only server file allowed to import `next/server`. It provides `requireSession()`, `requireAdminSession()`, `jsonError()`.
- `src/server/common/errors.ts`: `AppError` hierarchy with `ErrorCode` → HTTP status mapping. `jsonError` special-cases `RateLimitedError` (429 + Retry-After) and `ZodError` (422).
- Repo layer: only `catalog.repo.ts` and `reviews.repo.ts` exist and hold real query logic; every other service calls Prisma directly. Don't assume a repo exists.
- `src/contracts/**` — Zod schemas + DTO types shared by routes (validation) and client hooks (typing).

## Auth & RBAC

- Auth.js v5 config in `src/server/auth/authOptions.ts`, instantiated once in `src/auth.ts` (`handlers`, `auth`, `signIn`, `signOut`).
- **JWT session strategy.** `id` and `role` are baked into the token at sign-in and exposed via the `session` callback. Role changes only take effect when the token refreshes (staleness caveat).
- Providers: credentials (bcrypt cost 10, `src/server/auth/password.ts`) + Google (registered only when env vars present; `allowDangerousEmailAccountLinking: true`).
- **Edge guard**: `src/proxy.ts` (Next 16's middleware file, named `proxy.ts` not `middleware.ts`) verifies the JWT and checks `role === 'ADMIN'` for `/dashboard/:path*` and `/api/admin/:path*`; `/account` requires any authenticated user. Fast-fail only; real enforcement:
  - Every `/api/admin/**` route calls `requireAdminSession()` (verified complete coverage).
  - `(dashboard)/layout.tsx` re-checks `session.user.role === 'ADMIN'` server-side and redirects.
- Password reset: tokens stored SHA-256-hashed (`src/server/auth/tokens.ts`), single-use, TTL-checked. The reset link is emailed through the Resend mailer (`src/server/common/mailer.ts`; with `RESEND_API_KEY`/`EMAIL_FROM` unset it logs and skips). Outside production the response also carries the link inline (`devResetUrl`).
- Email verification: signup issues a 6-digit code plus a link token (`src/server/auth/verification.ts`, hashed rows in `VerificationToken`, 30 min TTL); credentials login is refused until `User.emailVerified` is set.

## Payments (strategy pattern)

- `src/server/payments/gateway.interface.ts`: `PaymentGateway { planPlacement?, init, parseCallback }`. Optional `planPlacement` (pure) returns `PlacementPlan` describing order creation (initial status, events, fee snapshot); providers are DB-free; `payments.service.ts` owns persistence and idempotency.
- `registry.ts` maps `PaymentMethod` → gateway: `cod.ts` (implements `planPlacement`; auto-confirm if no fee), `bank-transfer.ts` (customer submits ref → admin verifies), `bkash.ts` (grant→create→execute token flow), `sslcommerz.ts` (hosted checkout + validator API).
- Callback routes (`/api/payments/{provider}/{success,fail,cancel,ipn}`) are thin wrappers over `src/app/api/payments/_handlers.ts`.
- **Sandbox fallback**: with no credentials, providers redirect to `/api/payments/sandbox/*` harness pages that POST back `sandbox_`-prefixed refs. `parseCallback` now checks server-side credential presence *before* trusting that prefix (the prefix alone used to be trusted, which was the project's most critical security flaw; do not weaken this check).
- `paymentsService.applyCallback` runs in a transaction, dedupes by terminal payment status. On success it claims the order first (`confirmOrderInTx`: PENDING → CONFIRMED + `OrderEvent`), then writes the payment as a compare-and-set from PENDING; a lost race rolls the whole transaction back (no restock, no event, no email) and returns the current payment. A not-pending order still records the payment, logs `payments.callback.order_not_pending` and writes an audit `OrderEvent` (order's current status; "review or refund"). Failed/cancelled payments **do restock** (atomically in the same transaction, after the payment write wins).

## Cart

- **Logged-in**: `Cart`/`CartItem` rows keyed by unique `userId`. `cart.service.getCart` uses raw SQL for the snapshot; mutations use the ORM.
- **Guest**: localStorage via Zustand (`src/modules/cart/guest-cart.ts`); enriched for display via public `POST /api/cart/hydrate` (no persistence).
- **Merge on login**: `useGuestCartMerge` (mounted in `providers.tsx`) PUTs guest lines; server sums quantities, clamps to stock, merges transactionally.

## Checkout

1. `GET /api/checkout/config` — returns enabled payment methods (intersection of admin-flagged and gateway-configured), COD fee rule, QR/contact/note (always present, nullable, so orders can display them even if later disabled).
2. `POST /api/checkout/quote` — optional `paymentMethod` param; returns subtotal + coupon validation + shipping (`shipping.ts`: Dhaka 60৳ / outside 120৳, free ≥ 5000৳), plus `codFeeCents`, `dueOnDeliveryCents` (= total − fee), `codFeeRule` (null if no fee or non-COD method). The checkout UI derives the fee notice/QR/contact/txn field from this quote, not from the cached config's `cod.feeEnabled` (config is invalidated once if they disagree).
3. `POST /api/checkout` — `checkoutService.placeOrder` in one `prisma.$transaction`, in this order: consume the cart (count-checked `deleteMany`, serializes double submits); read settings via `tx` and reject a disabled method (400 `BadRequestError`); check line availability/stock; `priceOrder` (re-validates the coupon via `tx`, shipping, totals, and the COD fee through the payment strategy's `planPlacement`); optional `customerTxnId` duplicate pre-check; conditional stock decrement (`updateMany` where `stock >= qty`); conditional coupon `usedCount` bump; then ONE nested `order.create` carrying the item snapshots (name/sku/price), the `Payment` (PENDING, fee snapshot feeCents/feeType/feeValue/feeStatus) and the `OrderEvent`s (explicit increasing `createdAt`). COD is auto-CONFIRMED only if no fee applies. A lost race on the `customerTxnId` unique index maps to `TxnIdDuplicateError`. Response includes `feeRequired`.
4. The **route** then calls `paymentsService.kickoff` (outside the transaction) to get the gateway redirect URL.

Concurrency: the stock decrement and coupon increment are conditional `updateMany` guards inside the transaction (oversell and usage-limit overrun fail with a `ConflictError`), and the coupon is re-validated with the `tx` client. If `kickoff` fails, the route calls `checkoutService.cancelOrphanedOrder` (restock, release coupon, cancel the order).

## Orders lifecycle

`PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`, plus `CANCELLED`.

- COD auto-confirms at checkout only when no confirmation fee applies; with a fee, order stays PENDING until admin verifies via `paymentsService.verify` (outcome: VERIFIED claims order PENDING → CONFIRMED, REJECTED stays PENDING). Gateway success confirms via callback using compare-and-set; concurrent cancel wins atomically. Bank transfer confirms on admin verify (`paymentsService.verify`: claim the order first, then compare-and-set the payment; a loser gets `ConflictError` and rolls back).
- Admin transitions via `ordersService.transition` — validated against an explicit `ALLOWED_TRANSITIONS` map. When transitioning PENDING→CONFIRMED with COD fee PENDING or REJECTED, auto-waives the fee (sets feeStatus: WAIVED). Admin cancel and customer self-cancel both restock atomically.
- Customer self-cancel allowed while PENDING/CONFIRMED/PROCESSING — restocks atomically via the shared `restockOrderItems` helper.
- Every transition writes an `OrderEvent` (status, note, actorId) — the audit trail shown on both customer and admin order pages.

## Reviews & warranty

- Reviews: only for DELIVERED order items owned by the user; one per `orderItemId` (DB unique + service check). Public `GET /api/reviews?productId=` returns the list only (up to 50); the PDP computes the summary server-side.
- Warranty: customer files against a DELIVERED order (one active request per order); admin transitions OPEN → APPROVED/REJECTED, APPROVED → RESOLVED/REJECTED. Actor currently discarded (`void adminId`).

## Rate limiting & logging

- `src/server/common/rate-limit.ts`: fixed windows, enforced via `enforceRateLimit(key, policy, opts?)`. Store order: Upstash Redis when configured (one `INCR` script, hashed keys, never raw emails/IPs) → Postgres `RateLimitBucket` (default fallback, shared across serverless instances) → with `fallback: 'none'` a per-instance in-memory window (cap 5000 keys) instead of Postgres. Redis is optional; any Redis failure falls back, the limiter never fails closed on infrastructure errors.
- Covered: login, signup, forgot, reset, verify, resend-verify, change-password, checkout, checkout quote, warranty POST, review POST, `txn-check`, `txn-id`, public `POST /api/cart/hydrate` and `GET /api/catalog/products?q=` (the last two via `enforceIpLimit`, `fallback: 'none'`, no Postgres write on a public path). Routes map `RateLimitedError` to 429 + `Retry-After`.
- `src/server/common/logger.ts`: structured server logging helpers.

## Caching / ISR

Public catalog pages are ISR; Redis is an optional layer only for what ISR cannot cache (filtered/search lists, guest-cart variant display, rate limits).

- **Rendering modes**: `/products` and `/category/[slug]`, `/brand/[slug]` revalidate every 60 s; `/` and `/products/[slug]` every 120 s (`export const revalidate` in each page). The PDP uses an empty `generateStaticParams` so pages are built on first hit, then cached. Home and PDP render server-side; no server `auth()`/`cookies()` anywhere in the root or `(public)` layout tree (that would make every page dynamic).
- **Listing split** (`src/lib/listing-rewrites.ts`, consumed by `next.config.ts` `rewrites()`): a request carrying any filter key (`q`, `brandSlug`, `categorySlug`, `minPrice`, `maxPrice`, `inStock`, `sort`, `page`, `limit`) is rewritten, URL unchanged, to the dynamic `/live/products`, `/live/category/[slug]`, `/live/brand/[slug]` twins (`src/app/(public)/live/`). Default views stay ISR. The twins set a base-path canonical; a search (`q`) or direct `/live/*` hit is `noindex`, filtered views stay indexable (`src/app/components/listing-query.ts`, `liveRobots`). `/live/*` are pages, not API routes.
- **On-demand purge**: `src/app/api/_lib/revalidate.ts` (the only `next/cache` importer) exposes `revalidateCatalog` (admin catalog writes: product page, home, listings, sitemap, optionally the layout menu) and `revalidateProductPage` (review POST). Call it only after the service call succeeded; admin catalog and review routes do.
- **HTTP cache**: public catalog GET routes send `CATALOG_CACHE_CONTROL` (`public, s-maxage=30, stale-while-revalidate=60`); `GET /api/reviews` sends `public, s-maxage=10` (`src/app/api/_lib/cache-control.ts`). `GET /api/checkout/config` is `force-dynamic` + `no-store`.
- **PDP reviews**: the ISR HTML contains the review summary and the newest 10 reviews (server component); the full list (up to 50) is fetched from `/api/reviews` only after "Show all reviews". Public author names are "First L." (`src/server/reviews/reviews.service.ts`).
- **Redis cache** (`src/server/common/cache.ts`): `cached({ key, ttlSec }, loader)` = GET → loader → SET, with per-instance in-flight dedupe, TTL jitter, a 100 KB payload cap, a 250 ms per-call timeout and a circuit breaker (5 consecutive failures open it for 30 s). Every store call is fail-open: no store, error or timeout just runs the loader. Keys come from `buildKey(...)` = `gw:<VERCEL_ENV|local|test>:...`; list/search keys hash the canonical query with `stableHash`, and `v1` segments are bumped when a cached DTO shape changes. Cached: catalog menu shell (300 s), product lists (60 s) and search (120 s), guest-cart variant display (30 s).
- **Deferred writes**: the Redis SET runs after the response. `instrumentation.ts` injects Next `after()` through `setDefer`; `runDeferred` falls back to awaiting the write when `after()` throws (outside a request scope: tests, build). Used by `cached()` and `hydrateGuestCart`.
- **No Redis configured** (`UPSTASH_REDIS_REST_URL`/`_TOKEN` unset): `getStore()` returns null, loaders run directly, limiters use Postgres or memory. `next build` never touches Redis.

## Testing

Vitest in the node environment (config in `vitest.config.ts`), about 70 test files: pure-logic unit tests, service tests against the local Postgres (live Prisma, not mocked), and route-level tests in `src/app/api/__tests__`. A test file can opt into jsdom with a `// @vitest-environment jsdom` docblock (e.g. `src/hooks/__tests__/use-header-search-preview.test.ts`); the default stays node. No browser E2E yet (see `docs/plans/playwright-e2e-testing-plan.md`).
