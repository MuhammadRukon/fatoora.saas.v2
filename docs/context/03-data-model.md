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

### Business, EGS unit, customers
- **Business**: the seller. `ownerId` (indexed, not unique: one business per user is enforced in `business.service`), bilingual name/address fields, `vatNumber` char(15), `sellerIdScheme`/`sellerIdValue`, `buildingNumber` char(4), `postalCode` char(5), `countryCode` (default `SA`), `zatcaEnvironment` (default `SIMULATION`). VAT number and environment are locked (`BUSINESS_LOCKED_FIELDS`) once an EGS unit is ACTIVE.
- **EgsUnit** (schema only until onboarding): per `(businessId, environment)`, encrypted key/CSID columns, `lastIcv`, `lastInvoiceHash` (seeded with the ZATCA PIH). Partial unique index `EgsUnit_one_live_per_business_env` (`WHERE status <> 'REVOKED'`) lives in the migration SQL.
- **Customer**: scoped by `businessId`; either a VAT number or a buyer ID (scheme + value), never both. Scheme enums map `S700` to the DB value `700`.
- `resolveBusinessId(userId)` (`src/server/business/business-context.ts`) is the only place a request's business is derived; `BusinessRequiredError` (409 `BUSINESS_REQUIRED`) when none.

### Subscriptions
- **Subscription**: `userId` (cascade), `plan` (`MONTH_1 | MONTH_3 | MONTH_6 | MONTH_12`), `status` (`PENDING | ACTIVE`, default `PENDING`), `startsAt`/`endsAt` (null until activated), `activatedAt`, `activatedById` (admin, set null on delete). Index `(userId, status)`.
  - At most one PENDING row per user: partial unique index `Subscription_one_pending_per_user` (`WHERE status = 'PENDING'`), created in the migration SQL because Prisma cannot express it.
  - State (`src/server/subscriptions/subscriptions.service.ts`): ACTIVE if any ACTIVE row has `startsAt <= now < endsAt`, else PENDING if a request is open, else EXPIRED if any ACTIVE row ever existed, else NONE. Activation starts at `max(now, latest ACTIVE endsAt)` (stacking) and adds calendar months in UTC, clamped to month end.

### Documents
- **Document**: invoice, credit note or debit note (`kind`, `subtype`, `status` DRAFT/ISSUED), scoped by `businessId`. Money columns are integer halalas. `sequence`/`number` are null until issue (`@@unique([businessId, kind, sequence])`); `allocateNumber` (`src/server/documents/numbering.ts`) takes a `FOR UPDATE` lock on the Business row and returns `INV-/CN-/DN-` + 6 digits. `customerId` is `onDelete: NoAction` (acts as Restrict; Postgres reports a true RESTRICT as 23001, which Prisma does not map to P2003, so the `CUSTOMER_HAS_DOCUMENTS` mapping needs NoAction). `billingReferenceId` self-relation (NoAction). ZATCA columns (`uuid`, `icv`, `pih`, `invoiceHash`, `signedXml`, `clearedXml`, `qrBase64`, `submissionStatus`, `hasWarnings`, `zatcaResponse`, `submissionAttempts`...) are written by `issuance.service` at issue (null on drafts); `egsUnitId` is `onDelete: NoAction` (an EGS that signed documents cannot be deleted); `submittingSince` is a 2-minute lease so cron and manual retry never submit the same document twice; `buyerSnapshot`/`sellerSnapshot` hold `PartySnapshot` (contracts/documents) written at issue.
- **DocumentLine**: cascade; `quantity` Decimal(18,6), `taxRateBp` in basis points, per-line `net/vat/total` halalas.
- Totals and line amounts are always computed server-side by the pure `computeDocument` (`src/server/documents/vat-engine.ts`, also used by the form preview): half-up rounding, VAT per line, tax per (category, rate, exemption reason) subtotal at document level.

EGS onboarding and ZATCA issuance are added by later plan phases.

## Money

Integer halalas only (1 SAR = 100 halalas). Helpers in `src/server/common/money.ts`:
- `toHalalas(sar: string | number)`: exact decimal-string parsing, half-up rounding (`"10.005"` → 1001).
- `fromHalalas(halalas)`: SAR string with exactly 2 decimals.
- `formatSAR(halalas, 'en' | 'ar')`: display formatting.
