# Data Model

Source of truth: [`prisma/schema.prisma`](../../prisma/schema.prisma). PostgreSQL. Migrations start from one `..._init` migration.

## Entities

### Identity and auth
- **User**: email (unique), optional `emailVerified` (credentials login is refused while null), optional `passwordHash` (null for OAuth-only), `role` (`USER` | `ADMIN`, default `USER`), phone, image.
- **Account / Session**: standard Auth.js tables (JWT strategy is used, so `Session` is mostly unused).
- **VerificationToken**: email verification. Per signup/resend, two rows keyed by `identifier = email`: a SHA-256 of the 6-digit code and of the link token, 30 min TTL. All rows for the email are deleted on success (`src/server/auth/verification.ts`).
- **PasswordResetToken**: `tokenHash` (SHA-256, unique), `expiresAt`, `usedAt` (single-use).

### Infrastructure
- **RateLimitBucket**: fixed-window counters (`key` PK, `count`, `resetAt`, index on `resetAt`) behind `src/server/common/rate-limit.ts`.

### Subscriptions
- **Subscription**: `userId` (cascade), `plan` (`MONTH_1 | MONTH_3 | MONTH_6 | MONTH_12`), `status` (`PENDING | ACTIVE`, default `PENDING`), `startsAt`/`endsAt` (null until activated), `activatedAt`, `activatedById` (admin, set null on delete). Index `(userId, status)`.
  - At most one PENDING row per user: partial unique index `Subscription_one_pending_per_user` (`WHERE status = 'PENDING'`), created in the migration SQL because Prisma cannot express it.
  - State (`src/server/subscriptions/subscriptions.service.ts`): ACTIVE if any ACTIVE row has `startsAt <= now < endsAt`, else PENDING if a request is open, else EXPIRED if any ACTIVE row ever existed, else NONE. Activation starts at `max(now, latest ACTIVE endsAt)` (stacking) and adds calendar months in UTC, clamped to month end.

Businesses, EGS units, customers and documents are added by later plan phases.

## Money

Integer halalas only (1 SAR = 100 halalas). Helpers in `src/server/common/money.ts`:
- `toHalalas(sar: string | number)`: exact decimal-string parsing, half-up rounding (`"10.005"` → 1001).
- `fromHalalas(halalas)`: SAR string with exactly 2 decimals.
- `formatSAR(halalas, 'en' | 'ar')`: display formatting.
