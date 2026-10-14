# Architecture

## Layering

```
UI (src/app pages, src/modules components/hooks)
  → API route handlers (src/app/api/**)        — transport: parse Zod contract, auth check, delegate
    → Services (src/server/<domain>/*.service)  — business logic
      → Prisma (src/lib/prisma.ts)              — data access (no repo layer)
```

- `src/server/common/http.ts` is the only server file allowed to import `next/server`. It provides `requireSession()`, `requireAdminSession()`, `jsonError()`.
- `src/server/common/errors.ts`: `AppError` hierarchy with `ErrorCode` (from `src/contracts/errors.ts`) → HTTP status mapping. `jsonError` special-cases `RateLimitedError` (429 + Retry-After) and `ZodError` (422).
- Services call Prisma directly; there is no repo layer.
- `src/contracts/**`: Zod schemas + DTO types shared by routes (validation) and client hooks (typing).
- Multi-step writes use `prisma.$transaction` and pass the `tx` client to every helper called within.

## Auth and RBAC

- Auth.js v5 config in `src/server/auth/authOptions.ts`, instantiated once in `src/auth.ts` (`handlers`, `auth`, `signIn`, `signOut`).
- **JWT session strategy.** `id` and `role` are baked into the token at sign-in and exposed via the `session` callback. Role changes only take effect when the token refreshes.
- Providers: credentials (bcrypt cost 10, `src/server/auth/password.ts`) + Google (registered only when env vars are present).
- Signup (`src/server/auth/auth.service.ts`) creates `role: USER`. Admins are created by the seed.
- **Edge guard**: `src/proxy.ts` (Next 16's middleware file) verifies the JWT and requires `role === 'ADMIN'` for `/dashboard/:path*` and `/api/admin/:path*`, and any valid token for `/app/:path*`, `/plans`, `/api/app/:path*` and `/api/subscriptions/:path*` (an ADMIN visiting `/app` or `/plans` is redirected to `/dashboard`). Pages redirect to `/login`, API calls get 401. Fast-fail only; real enforcement:
  - Every `/api/admin/**` route calls `requireAdminSession()`; every `/api/app/**` route calls `requireAppSession()` (USER + ACTIVE subscription, else 402), except the GET routes over issued documents, which use `requireAppReadSession()` and also admit an EXPIRED subscription (read-only; see `src/lib/app-access.ts` for the pages the layout lets EXPIRED open).
  - `(dashboard)/layout.tsx` re-checks `session.user.role === 'ADMIN'`, `(app)/layout.tsx` re-checks `role === 'USER'`, and `(app)/app/layout.tsx` requires an ACTIVE subscription.
- Password reset: tokens stored SHA-256-hashed (`src/server/auth/tokens.ts`), single-use, TTL-checked, emailed through the mailer. Outside production the response also carries `devResetUrl`.
- Email verification: signup issues a 6-digit code plus a link token (`src/server/auth/verification.ts`, hashed rows in `VerificationToken`, 30 min TTL); credentials login is refused until `User.emailVerified` is set. Without `RESEND_API_KEY` the signup action returns the code as `devCode`.

## ZATCA rules (enforced as the domains land)

- Store ZATCA secrets and private keys encrypted with AES-256-GCM (`ZATCA_ENCRYPTION_KEY`); never return them to the client or log them.
- Scope every query by `businessId` and check ownership server-side on every route.
- An issued document is never mutated; a correction is a new document.
- Allocate ICV and PIH under a row lock in one transaction; the ICV never resets and has no gaps.
- Persist a signed document before any network call to ZATCA.
- ZATCA crypto lives in `src/server/zatca/` as pure Node functions (no Prisma, no Next, no env; the gateway client takes an injected `fetch`).

## Rate limiting and logging

- `src/server/common/rate-limit.ts`: fixed windows via `enforceRateLimit(key, policy, opts?)`. Store order: Upstash Redis when configured → Postgres `RateLimitBucket` (default fallback, shared across instances) → with `fallback: 'none'` a per-instance in-memory window. Any Redis failure falls back; the limiter never fails closed on infrastructure errors.
- Covered: login, signup, forgot, reset, verify, resend-verify, change-password. Routes map `RateLimitedError` to 429 + `Retry-After`.
- `src/server/common/cache.ts` holds the optional Redis client wrapper (fail-open, timeout, circuit breaker); today only the limiter uses it.
- `src/server/common/logger.ts`: structured server logging helpers.

## Testing

Vitest in the node environment (`vitest.config.ts`): pure-logic unit tests, service tests against the local Postgres (live Prisma, not mocked), and route-level tests in `src/app/api/__tests__`. A file opts into jsdom with a `// @vitest-environment jsdom` docblock. No browser E2E yet.
