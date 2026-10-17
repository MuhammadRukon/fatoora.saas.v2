# Fatoora SaaS v2 — Implementation Plan

Status: APPROVED · Date: 2026-10-14 · Repo: `C:\Users\muhammad\Desktop\fatoora-saas-v2` · Origin: `https://github.com/MuhammadRukon/fatoora.saas.v2.git`

## Summary

Build a multi-tenant ZATCA Phase 2 e-invoicing SaaS. It reuses the gadget-website architecture (Next 16 App Router, Prisma + Postgres, Auth.js v5, contracts-first Zod, service layer) instead of the Payload CMS app in `Desktop/fatoora`.

User flow:
1. A user signs up and verifies their email.
2. They request a plan (1, 3, 6 or 12 months). The request writes a `PENDING` subscription. There is no payment.
3. An admin activates it manually.
4. The user then creates a business profile, onboards the business's EGS unit with ZATCA (Simulation or Production) using an OTP, manages customers, and issues standard (B2B) and simplified (B2C) invoices and credit/debit notes. Documents are signed, hash-chained, carry a QR (TLV tags 1–9), and are reported to or cleared by ZATCA.

**Done** means:
- Every acceptance criterion below passes.
- `npm run zatca:sim-check` returns PASS with zero errors and zero warnings against ZATCA Simulation for all 6 document types.

## Context and findings

### Source architecture (gadget-website, `C:\Users\muhammad\Desktop\gadget-website`)
- **Stack:** Next ^16.2.4, React 19, TS 5, Node 24 (`.nvmrc`), Prisma ^6.16 with Postgres, Auth.js v5 beta (JWT strategy), Zod 4, react-hook-form, TanStack Query/Table, shadcn/ui, Tailwind 4, Vitest 3 (DB-backed, local DB guard).
- **Layering** (CLAUDE.md): `src/contracts` (Zod), then `src/server/<domain>/*.service.ts`, then `src/app/api/**` route handlers, then `src/constants/queryKeys.ts`, then `src/modules/<domain>/hooks.ts`, then UI.
  - Only `src/server/common/http.ts` may import `next/server`.
  - Errors are `AppError` subclasses (`src/server/common/errors.ts`) mapped by `jsonError`.
  - Money is integer minor units.
  - Multi-step writes use `prisma.$transaction` and pass `tx`.
- **Auth:**
  - Signup: `src/server/auth/auth.service.ts:35`, which creates the user with `role: CUSTOMER` at :44.
  - Verification (6-digit code plus token, 30 min TTL): `src/server/auth/verification.ts`.
  - Login refuses users with `emailVerified = null`: `src/server/auth/authOptions.ts:111`.
  - JWT carries `id` and `role`: `authOptions.ts:177-190`.
  - Mail goes through the Resend REST API: `src/server/common/mailer.ts:36`. It falls back to dev codes when `RESEND_API_KEY` is unset.
  - Pages: `src/app/(public)/{login,signup,verify-email,forgot-password,reset-password}`.
- **Guards:**
  - `src/proxy.ts`: JWT-only; matcher at :56, admin rule at :18/:37.
  - `src/server/common/http.ts:32-38`: `requireSession` / `requireAdminSession`.
  - `src/app/(dashboard)/layout.tsx:14-21`: server-side admin re-check.
- **Admin users:**
  - `src/server/users/users.service.ts:17-32` (`listAdminUsers`; the select block is duplicated 3×).
  - `src/contracts/admin-users.ts`.
  - `src/app/(dashboard)/dashboard/users/page.tsx`. Its `AdminUser` type comes from `src/server/catalog/catalog.repo.ts`.
- **Category → Customer and Product → Invoice templates:**
  - `src/contracts/catalog.ts:29,39,85`
  - `src/server/catalog/catalog.service.ts:213-258` (category CRUD) and `:280-353` (product create/update in a transaction)
  - `src/app/api/admin/catalog/{categories,products}/**`
  - `src/modules/admin/catalog/hooks.ts:60-113`
  - `src/modules/admin/catalog/components/product-form.tsx` (a 590-line RHF form; the pattern for the invoice form)
- **Seed bug to fix:** `prisma/seed.ts:163` upserts the admin without `emailVerified`, so the seeded admin cannot log in (authOptions.ts:111).
- **Things to strip:**
  - Commerce: cart, checkout, orders, payments, coupons, warranty, reviews, addresses, brands, storefront `(public)` pages, Cloudinary/media.
  - PaymentSettings and the serial vitest project.
  - BDT money helpers (`src/server/common/money.ts`).
  - "Cryptech" branding: `src/app/layout.tsx`, `mailer.ts:74-110`, `auth-hint.ts:6`, README, `.env.example`, seed.
  - Full lists are in Phase 1.

### Reference app (Desktop/fatoora)
- It is Phase 1 only (QR tags 1–5), so no Phase 2 code is reusable.
- Field reference only:
  - `src/collections/Customers.ts`: name, branch, VAT, address.
  - `src/collections/Users.ts:614-706`: seller name EN/AR, VAT, CR, address EN/AR.
  - `src/collections/Invoices.ts`: line items with a per-line tax rate.
- Known bugs not to copy:
  - String-sorted invoice numbers (`INV-9` > `INV-10`).
  - Discount subtracted after VAT.
  - 1-byte TLV length used without a guard.

### ZATCA Phase 2 facts (researched 2026-10-14, authoritative sources)
- **Documents:**
  - XML Implementation Standard v1.2 (2023-05-19).
  - Security Features Implementation Standards v1.2 (2023-05-19).
  - E-invoicing Detailed Technical Guidelines v2 (Nov 2022).
  - Fatoora Portal User Manual v3 (May 2023).
  - Developer Portal Manual v3.
  - Fatoora Developer Community staff posts for changes since then (SDK 3.3.0 → 3.4.x).
  - Local text extracts: `scratchpad/z/*.c.txt`. The executor's Phase 5 agent re-reads the official PDFs; links are in Appendix A.
- **Hosts and paths:** base `https://gw-fatoora.zatca.gov.sa/e-invoicing/`, with the segment `core/` (production) or `simulation/`.
  - Paths: `compliance`, `compliance/invoices`, `production/csids`, `invoices/reporting/single`, `invoices/clearance/single`.
  - Sandbox (developer-portal) is deprecated per ZATCA staff (Sep 2026) and is **not supported**.
  - The legacy host `gw-apic-gov.gazt.gov.sa` was decommissioned on 2025-09-14.
- **Headers:**
  - `Accept-Version: V2`, `Accept-Language: en`, `Content-Type: application/json`.
  - `OTP` header on `/compliance` only.
  - Auth is `Basic base64(binarySecurityToken:secret)`.
- **Onboarding sequence:**
  1. OTP from the Fatoora portal (valid 1h).
  2. Generate a secp256k1 key and CSR. The CSR includes:
     - Template OID `1.3.6.1.4.1.311.20.2`: `ZATCA-Code-Signing` (production) or `PREZATCA-Code-Signing` (simulation).
     - SAN dirName with `SN=1-..|2-..|3-..`, `UID=<VAT>`, `title=1100`, `registeredAddress`, `businessCategory`.
  3. `POST compliance` returns `{requestID, binarySecurityToken, secret}`.
  4. Send 6 compliance documents (standard and simplified × invoice/credit/debit) to `compliance/invoices`.
  5. `POST production/csids` with `{compliance_request_id}`.
- **Hash:**
  1. Remove `ext:UBLExtensions`, `cac:AdditionalDocumentReference[cbc:ID='QR']` and `cac:Signature`, and drop the XML declaration.
  2. Canonicalize with C14N 1.1.
  3. SHA-256, then base64 of the raw digest.
  - First PIH seed: `NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==`.
- **Signature:** enveloped XAdES-BES using ECDSA-SHA256 on secp256k1 with DER encoding.
  - Two references: `invoiceSignedData` (3 XPath transforms plus C14N 1.1) and `#xadesSignedProperties`.
  - Known pitfalls:
    - The cert digest is base64 of the *hex string* of the SHA-256.
    - The SignedProperties digest must be computed over its exact serialized form.
    - Never re-serialize the XML after signing.
- **QR:** base64 TLV with a 1-byte tag and 1-byte length, UTF-8 values, a limit of 700 characters per the published spec (raised to 1000 since SDK 3.3.4, per a third-party report).
  - Tags: 1 seller name, 2 VAT, 3 timestamp, 4 total incl. VAT (BT-115 since SDK 3.3.0), 5 VAT total, 6 invoice hash, 7 signature, 8 public key, 9 certificate signature.
  - Tags 6–9 apply to simplified documents. For standard documents, ZATCA returns the QR in the cleared XML.
- **Rules:**
  - Documents are immutable once issued.
  - ICV increments per EGS unit with no gaps and is never reset.
  - A rejected document burns its UUID and ICV; a correction is a new document.
  - Simplified documents are reported within 24h. Standard documents must be CLEARED before they reach the buyer.
  - Credit and debit notes need a billing reference (BT-25) and a reason (KSA-10).
  - Gregorian dates only.
  - Human-readable output must be in Arabic.
  - A PDF form must be PDF/A-3 (deferred; the signed XML is the legal record).
- **Status codes:**
  - 200 OK.
  - 202 accepted with warnings (do not resubmit).
  - 303 clearance disabled (use reporting).
  - 400 rejected.
  - 401 auth.
  - 413 too large.
  - 500 server error.
- **Unverifiable items (the Swagger is behind login):**
  - Exact response JSON field names beyond `validationResults`, `reportingStatus` and `clearanceStatus`.
  - The `Clearance-Status` header.
  - The renewal method.
  - The `X509IssuerName` format.
  - All are resolved empirically by the Simulation gate (Phase 5 / Phase 6 acceptance criteria). The executor treats a Simulation response as ground truth over any doc.

### Reuse
- From gadget, unchanged: auth (`src/server/auth/*`, `src/modules/auth/*`, auth pages and API), `src/server/common/{errors,http,rate-limit,pagination,logger,cache,db-target,slug}.ts`, the mailer wrapper, `src/lib/{prisma,fetcher,redis}.ts`, the shadcn primitives, dashboard shell components (`dashboard-sidebar`, `data-table`, `site-header`, `nav-*`), the Vitest setup and the db guard.
- Dependencies: no new runtime dependency except those justified in Phase 5:
  - `@xmldom/xmldom` + `xpath` (DOM for UBL; Node has no DOM).
  - `@peculiar/x509` + `pkijs` + `asn1js` (CSR with secp256k1; `node-forge` lacks secp256k1).
  - `qrcode` (QR image rendering).
- Dev-only dependency: `zatca-xml-js` (wes4m, MIT) as a test cross-check. If it fails to install on Node 24, vendor only its test vectors.

### Skills the executor invokes
- `git-hygiene`: every branch, commit and PR.
- `tdd`: Phases 2–7, for services and pure ZATCA functions.
- `prisma:prisma-cli`, `prisma:prisma-client-api`, `prisma:prisma-database-setup`: schema, migrations, row-lock queries.
- `impeccable` (or `frontend-design:frontend-design`): Phase 2/3/4 UI (plans cards, app shell, invoice form, bilingual print view).
- `security-review`: end of Phase 6 (credentials and crypto).
- `code-review`: the Cross-Validation phase only.
- `run`: start and drive the app for end-to-end checks.
- `supercharged-executor` or `subagent-driven-development`: orchestration.

**Approach:** fork the gadget architecture into a new repo, strip commerce, and then add domains in dependency order (subscriptions → business/customers → documents → ZATCA crypto → onboarding → issuance).
- Simpler options rejected:
  - Phase 1 QR only: the user requires Phase 2.
  - Reusing fatoora's Payload code: no Phase 2 code exists there and Payload is unwanted.
- Larger options rejected:
  - A queue service, multi-business UI, PDF/A-3, payments.

## Constraints, assumptions, risks

### Non-negotiable
- Validate at every trust boundary: Zod contracts on every API input.
- Scope every query by `businessId`, and check ownership server-side on every route.
- Store ZATCA secrets and private keys encrypted with AES-256-GCM. Never return them to the client or log them.
- An issued document is never mutated.
- Allocate ICV and PIH under a row lock in one transaction.
- Errors must never lose a signed document. Persist it before any network call.
- Accessibility: shadcn/Radix defaults, labelled form fields, keyboard-reachable actions, RTL-correct Arabic print view.
- Keep everything the user asked for.

### Decided
- Postgres + Prisma (not Mongo): the hash chain needs transactional row locks, the data is relational, and gadget's data layer and tests can be reused.
- Roles are the `UserRole` enum `{ADMIN, USER}`.
- Four plan cards: `MONTH_1`, `MONTH_3`, `MONTH_6`, `MONTH_12`. No prices, no payment.
- Business is 1:1 with User in v1, enforced in the service, not the schema (`Business.ownerId` is not unique). Every domain query takes `businessId`, so multi-business later needs only a selector and a membership table.
- ZATCA environments are `SIMULATION | PRODUCTION`, chosen per business, default `SIMULATION`.
- Node-only crypto, isolated in `src/server/zatca/` as pure functions, so it can move to a worker or Lambda later.
- Submission is synchronous on issue, with PENDING_RETRY, a manual Retry, and a Vercel Cron retry.
- No Cloudinary and no logo. Email via Resend. App name "Fatoora". Hosted on Vercel.
- Prices are entered VAT-exclusive only.

### Assumptions (confirmed)
- The user has a real TRN and Fatoora Simulation portal access for end-to-end tests.
- The user creates a new local DB `fatoora_v2` (plus `fatoora_v2_shadow`) and a new Prisma Postgres DB for production. The gadget DBs are never touched.
- The user downloads the ZATCA SDK ZIP once and copies only its sample `.xml` files into gitignored `tools/zatca-samples/`. No Java.

### Risks and mitigations

| Risk | Mitigation | Owner |
|---|---|---|
| C14N 1.1 has no mature Node lib | In-house canonicalizer for the UBL subset; golden tests vs SDK samples and zatca-xml-js; Simulation gate | Executor P5 |
| Unpublished Swagger shapes | API client parses defensively (unknown fields kept in `zatcaResponse` JSON); Simulation responses are recorded as fixtures | Executor P6 |
| Time-format warnings (`invoiceTimeStamp_QRCODE_INVALID`) | Single source of the timestamp: IssueDate/IssueTime in UTC (`hh:mm:ssZ`), QR tag 3 is the same instant `YYYY-MM-DDTHH:mm:ssZ`; the Simulation gate must return zero warnings | Executor P5/P7 |
| PIH after a rejected document | Chain advances on every generated document (the rejected one included). P7 Simulation test: issue → force reject → issue next must PASS | Executor P7 |
| Vercel Hobby cron is daily only | Manual Retry button plus a dashboard banner for documents older than 18h unreported; hourly once on Vercel Pro | User (plan upgrade) |
| Force-push destroys origin `93792d2` | Bundle backup before the push plus an explicit user confirm | Executor P0, user confirms |
| Auth.js v5 is beta | Pin the exact version from gadget's lockfile | Executor P1 |

### Open questions
None blocking. Unverifiable ZATCA details are resolved by the Simulation gate (above).

## Workspace setup (first step)
- **Repo:** `C:\Users\muhammad\Desktop\fatoora-saas-v2`. Already `git init -b main` with origin set, no commits.
- **Bootstrap:** Phase 0 is the only work committed directly to `main`. The repo is empty, so an initial commit must exist. It then creates `dev` from `main`.
- **Every later phase:** a plain branch in this folder (no worktree), created from `dev`. The branch name, commit format and PR target (`dev`) follow `git-hygiene`.
- **Release:** after the Cross-Validation phase, merge `dev` → `main` via PR.

---

## Phase 0 — Bootstrap repo from gadget-website

**Scope:** copy files only, with no code edits except `.gitignore`. Then the first commit, the force push, and the `dev` branch.

**Steps**
1. Copy `C:\Users\muhammad\Desktop\gadget-website\*` into `fatoora-saas-v2\` with `robocopy /E`, excluding:
   - directories `.git`, `node_modules`, `.next`, `.claude\worktrees`
   - files `.env`, `.env.dev`, `tsconfig.tsbuildinfo`
2. Append to `.gitignore`: `tools/zatca-samples/` and `.env*` with `!.env.example` (if not already present).
3. Secret scan before committing.
   - Command: `git grep -nIE "(sk_|re_[A-Za-z0-9]{10,}|AKIA|BEGIN (EC |RSA )?PRIVATE KEY|postgres(ql)?://[^ ]*:[^ ]*@)" -- . ':!package-lock.json'`
   - Any hit in a tracked file must be removed before the commit.
4. Commit: `npm install` (verifies the lockfile), then `git add -A`, then commit `chore: bootstrap from gadget-website architecture` on `main`.
5. Back up the remote:
   - `git fetch origin`
   - `git bundle create ..\fatoora-saas-v2-origin-backup-93792d2.bundle origin/main`
6. **STOP. Ask the user to confirm the force push** (irreversible on the remote). On yes: `git push --force-with-lease=main:93792d2e1291743aaeec82856562036935f6adc0 origin main`
7. Create and push `dev`: `git switch -c dev`, then `git push -u origin dev`.

**Acceptance criteria**
- AC0.1: `git ls-remote origin` shows `refs/heads/main` and `refs/heads/dev` at the same SHA, which equals local `main`. `93792d2` is not an ancestor: `git merge-base --is-ancestor 93792d2 main` exits 1, run after the fetch.
- AC0.2: `..\fatoora-saas-v2-origin-backup-93792d2.bundle` exists, and `git bundle verify` on it exits 0.
- AC0.3: `git ls-files | grep -E "^\.env$|^\.env\.dev$|node_modules/|\.next/"` returns nothing.
- AC0.4: the secret-scan command in step 3 returns no matches.
- AC0.5: gadget-website is untouched. `git -C ..\gadget-website status --porcelain` output is identical before and after.

---

## Phase 1 — Strip commerce, rebrand, fresh schema

**Scope:** remove gadget-specific code, rename roles, make the money helpers SAR-based, create a fresh `0_init` migration, fix the seed, and rewrite the docs. No new features.

**Steps**
1. **Delete server code:**
   - `src/server/{cart,checkout,orders,payments,settings,coupons,warranty,reviews,catalog,media,analytics}/`
   - `src/server/users/address.service.ts`
2. **Delete contracts:** `src/contracts/{address,cart,checkout,coupons,payment-settings,payments,reviews,warranty,catalog,analytics}.ts`, plus their `__tests__`, and the matching exports in `src/contracts/index.ts`.
3. **Delete API routes:** `src/app/api/{addresses,cart,catalog,checkout,orders,payments,products,reviews,upload,warranty}`, plus `src/app/api/admin/{brands,catalog,coupons,orders,payments,settings,warranty,media,analytics}`, plus the commerce tests in `src/app/api/__tests__`. Keep `route-rate-limits.test.ts`, trimmed to auth routes.
4. **Delete pages:**
   - All of `src/app/(public)/*` except `login`, `signup`, `verify-email`, `forgot-password`, `reset-password` and `layout.tsx`.
   - `src/app/(dashboard)/dashboard/{brands,coupons,orders,payments,warranty,settings,products,categories}`.
   - `src/app/components/*`, `src/app/common/*`, `src/app/constants`, `src/app/utils/static-text.ts`.
   - `src/app/(public)/page.tsx` becomes a minimal landing page with Login and Sign up links.
5. **Delete modules and libs:**
   - `src/modules/{cart,checkout,orders,reviews,storefront,warranty}`, `src/modules/admin/{payments,settings,coupons,orders,catalog}` (move `useAdminUsers` and `useAdminUserMutations` into a new `src/modules/admin/users/hooks.ts` first).
   - `src/modules/account/components/address-form.tsx`, `src/lib/{cod-fee,primary-payment.ts,listing-rewrites.ts}`.
   - `src/components/category-sidebar.tsx`, `src/stores/mobile-search.store.ts`, `src/hooks/use-header-search-preview.ts`.
   - Remove `useGuestCartMerge` from `src/components/providers.tsx`.
   - Remove the payment-only `TxnIdDuplicateError` in `errors.ts:62`.
6. **Roles:** rename `CUSTOMER` → `USER` everywhere listed in the impact report:
   - `schema.prisma:18,379`, `seed.ts`, `auth.service.ts:44`, `http.ts:18`, `contracts/admin-users.ts`, `dashboard/users/page.tsx:45-55`, `rbac.test.ts:14,25`, `next-auth.d.ts`, `.env.example` (`SEED_CUSTOMER_*` → `SEED_USER_*`).
   - Move the `AdminUser` type out of the deleted `catalog.repo.ts` into `src/server/users/users.service.ts`, and extract its duplicated select into one `adminUserSelect` constant.
7. **Schema:** keep `User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken`, `RateLimitBucket` and the `UserRole` enum. Remove every other model and enum. Delete `prisma/migrations/*`, then `npx dotenv -e .env.dev -- prisma migrate dev --name init` to create a fresh `0_init`.
8. **Money:** rewrite `src/server/common/money.ts` to SAR:
   - `CURRENCY = 'SAR'`, `toHalalas(sar: string|number): number` with half-up rounding, `formatSAR(halalas, locale: 'en'|'ar')`, `fromHalalas(halalas): string` with exactly 2 decimals.
   - Update `money.test.ts`.
9. **Env:**
   - `src/env.ts`: remove CLOUDINARY_*, SSLCOMMERZ_*, BKASH_*. Add `ZATCA_ENCRYPTION_KEY` (base64 of 32 bytes; required) and `CRON_SECRET` (required in production).
   - `.env.example`: DB names `fatoora_v2` and `fatoora_v2_shadow`, `EMAIL_FROM=Fatoora <no-reply@example.com>`, `APP_NAME=Fatoora`.
   - `next.config.ts`: remove the Cloudinary host and the `/live/*` rewrites.
   - `package.json`: name `fatoora-saas-v2`; remove the `cloudinary` and `next-cloudinary` dependencies.
10. **Vitest:** remove the `settings-serial` project from `vitest.config.ts` and update the comment in `vitest.global-setup.ts`.
11. **Seed:** `prisma/seed.ts`:
    - Remove `seedCatalog`.
    - Upsert the ADMIN from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` with `emailVerified: new Date()`.
    - Optional demo USER from `SEED_USER_*`, also verified.
    - Keep the production guard.
12. **Branding and docs:**
    - Replace "Cryptech", "Tecnologia" and "gadget" in `src/app/layout.tsx` (metadata; JSON-LD removed), `mailer.ts` templates (footer: "Fatoora", no address; remove the order/payment/status templates), `auth-hint.ts:6` key `fatoora.authHint`, and `README.md`.
    - Rewrite `CLAUDE.md`: Project section for Fatoora; remove the Payments, Checkout, Cart and Orders sections; keep the conventions; add the ZATCA rules from this plan's Constraints.
    - Delete `docs/{product,e2e,plans/*,SEO-AUDIT.md}` (keep `docs/plans/` for this plan), and rewrite `docs/context/*` to match.
    - Remove `src/app/sitemap.ts`, and set `robots.ts` to disallow `/app`, `/dashboard` and `/api`.
13. **Sidebar:** `src/components/dashboard-sidebar.tsx:35-45` `navMain` becomes `[Dashboard, Users]` only. `src/app/(dashboard)/dashboard/page.tsx` becomes a placeholder with user and subscription counts (implemented in P2).

**Acceptance criteria**
- AC1.1: `npx tsc --noEmit` exits 0.
- AC1.2: `npx dotenv -e .env.dev -- npx vitest run` exits 0. Surviving suites include `auth.service.test.ts`, `verification.test.ts`, `rbac.test.ts`, `actions-rate-limit.test.ts`, `rate-limit.test.ts`, `errors.test.ts`, `db-target.test.ts` and `money.test.ts`.
- AC1.3: `npx dotenv -e .env.dev -- next build` exits 0.
- AC1.4: `git grep -niE "cryptech|tecnologia|gadget|cloudinary|sslcommerz|bkash|CUSTOMER\b" -- src prisma .env.example package.json README.md CLAUDE.md` returns no matches.
- AC1.5: `prisma/migrations/` contains exactly one migration folder, and `prisma migrate status` against `fatoora_v2` reports "Database schema is up to date".
- AC1.6: `money.test.ts` cases:
  - `toHalalas("10.005") === 1001`
  - `toHalalas("10.004") === 1000`
  - `fromHalalas(150) === "1.50"`
  - `formatSAR(123456,'en')` contains `1,234.56`
- AC1.7: after `npm run db:seed` on an empty DB, `POST /api/auth/callback/credentials` with the seed admin credentials succeeds, and the session `role === 'ADMIN'`. Verified via the login page with the `run` skill: the user lands on `/dashboard`.
- AC1.8: signup at `/signup` with a new email creates `User{role:'USER', emailVerified:null}`. Without `RESEND_API_KEY` the response includes `devCode`. Submitting it at `/verify-email` sets `emailVerified`. Logging in before verification shows the "unverified" error.
- AC1.9: `GET /dashboard` as a logged-in USER redirects to `/login` (existing guard). `GET /api/admin/users` as a USER returns 401.

---

## Phase 2 — Plans, subscriptions, admin activation, app gate

**Scope:** the `Subscription` model, `/plans`, the subscription gate for `/app/*`, admin users with subscription data, and activation. The `/app` home page here is a placeholder.

**Steps** (contracts-first, `tdd`)
1. **Schema:**
   - `enum SubscriptionPlan { MONTH_1 MONTH_3 MONTH_6 MONTH_12 }`
   - `enum SubscriptionStatus { PENDING ACTIVE }`
   - `model Subscription { id cuid; userId → User (onDelete Cascade); plan SubscriptionPlan; status SubscriptionStatus @default(PENDING); startsAt DateTime?; endsAt DateTime?; activatedAt DateTime?; activatedById String? → User; createdAt; updatedAt; @@index([userId, status]) }`
   - In the migration SQL, add `CREATE UNIQUE INDEX "Subscription_one_pending_per_user" ON "Subscription"("userId") WHERE "status" = 'PENDING';`
2. **Contract** `src/contracts/subscriptions.ts`:
   - `subscriptionCreateSchema = z.object({ plan: z.enum(SubscriptionPlan) }).strict()`
   - `PLAN_MONTHS = {MONTH_1:1, MONTH_3:3, MONTH_6:6, MONTH_12:12}`
   - `SubscriptionDTO`
   - `subscriptionStateSchema` = `NONE | PENDING | ACTIVE | EXPIRED`, with `activeUntil` and `pending`.
3. **Service** `src/server/subscriptions/subscriptions.service.ts`:
   - `requestPlan(userId, plan)`: if a PENDING row exists, throw `ConflictError('SUBSCRIPTION_PENDING')`. Also map P2002 on the partial index to the same error. Create PENDING.
   - `getState(userId, now=new Date())`: ACTIVE if any `status=ACTIVE AND startsAt<=now AND endsAt>now`; otherwise PENDING if a pending row exists; otherwise EXPIRED if any ACTIVE row ever existed; otherwise NONE.
   - `activate(subscriptionId, adminId, now)`: in a `$transaction`, lock the row with `SELECT ... FOR UPDATE`. If it is not PENDING, throw `ConflictError('SUBSCRIPTION_NOT_PENDING')`. `startsAt = max(now, latest endsAt of the user's ACTIVE rows)`, `endsAt = addMonths(startsAt, PLAN_MONTHS[plan])` (calendar months, UTC). Set `status ACTIVE`, `activatedAt now`, `activatedById`.
   - `assertActive(userId)`: throws `SubscriptionRequiredError` (new `AppError`, HTTP 402, code `SUBSCRIPTION_REQUIRED`).
4. **HTTP helper:** in `src/server/common/http.ts`, add `requireAppSession()`. It requires a session with `role === 'USER'`, calls `subscriptions.assertActive`, and returns `{userId}`.
5. **API:**
   - `POST /api/subscriptions` (USER session; no active-subscription requirement) → 201 `SubscriptionDTO`.
   - `GET /api/subscriptions/me` → the state DTO.
   - `GET /api/admin/users`: extend `listAdminUsers` with `subscriptions` (latest 5, desc) plus a computed `subscriptionState`.
   - `POST /api/admin/subscriptions/[id]/activate` (admin) → 200 `SubscriptionDTO`.
6. **Proxy:** `src/proxy.ts` matcher adds `/app/:path*`, `/plans`, `/api/app/:path*`, `/api/subscriptions/:path*`.
   - `needsUser` covers `/app`, `/plans`, `/api/app` and `/api/subscriptions`.
   - Remove `/account`.
   - An ADMIN hitting `/app` or `/plans` is redirected to `/dashboard`.
7. **Pages:**
   - `src/app/(app)/plans/page.tsx`: four cards (1, 3, 6, 12 months; no price), each with a "Request plan" button that uses a TanStack mutation.
     - When the state is PENDING, the cards are disabled with the banner "Your <plan> request is awaiting admin activation".
     - When ACTIVE, a banner shows "Active until <date>". Requesting another plan is allowed, and it stacks after the current `endsAt`.
   - `src/app/(app)/app/layout.tsx`: server layout. It runs `await auth()`; a non-USER is redirected (`/login` or `/dashboard`). It calls `getState`, and anything not ACTIVE redirects to `/plans`.
   - `src/app/(app)/app/page.tsx`: placeholder home.
   - Login success redirect: ADMIN → `/dashboard`, USER → `/app`.
8. **Admin UI:** `dashboard/users/page.tsx` gets these columns: Name, Email, Verified, Joined, Subscription state badge, Latest plan, Requested at, Active until, and Action ("Activate" button only on a PENDING row, which opens a confirm dialog). The admin can no longer create or edit roles: remove that form, since admins are seed-created.
   - `dashboard/page.tsx` shows counts: total users, PENDING requests, ACTIVE subscriptions.

**Acceptance criteria**
- AC2.1: `POST /api/subscriptions {"plan":"MONTH_3"}` as a verified USER with no rows → 201 with body `{status:"PENDING", plan:"MONTH_3", startsAt:null, endsAt:null}`.
- AC2.2: repeating AC2.1 (any plan) while PENDING → 409 `{code:"CONFLICT", message contains "SUBSCRIPTION_PENDING"}`. The DB still holds exactly 1 PENDING row for that user. A service test runs two concurrent `requestPlan` calls via `Promise.all` and asserts exactly 1 row.
- AC2.3: `POST /api/subscriptions {"plan":"MONTH_2"}` → 400 validation error. Unauthenticated → 401. As ADMIN → 403.
- AC2.4: admin `POST /api/admin/subscriptions/:id/activate` on a PENDING MONTH_1 created by a USER with no prior subscriptions, with `now = 2026-01-31T10:00:00Z` injected in the service test → `status ACTIVE`, `startsAt = 2026-01-31T10:00:00Z`, `endsAt = 2026-02-28T10:00:00Z` (clamped to month end).
- AC2.5: activating an ACTIVE subscription → 409 `SUBSCRIPTION_NOT_PENDING`. Activation by a USER → 401 or 403. A nonexistent id → 404.
- AC2.6 (stacking): the user has ACTIVE until `2026-06-01T00:00Z`, requests MONTH_6, and the admin activates at `2026-05-01` → `startsAt = 2026-06-01T00:00Z`, `endsAt = 2026-12-01T00:00Z`.
- AC2.7 (gate): `getState` returns NONE (no rows), PENDING (pending only), ACTIVE (`startsAt <= now < endsAt`), and EXPIRED (`now >= endsAt` with no other active row). One test per case.
- AC2.8 (pages, via the `run` skill): a USER in state NONE visiting `/app` is redirected to `/plans`. After a request, `/plans` shows the awaiting banner and disabled cards. After admin activation, `/app` renders. An ADMIN visiting `/app` is redirected to `/dashboard`.
- AC2.9: any `/api/app/*` route stub (`GET /api/app/ping`, kept as a test fixture) returns 402 `{code:"SUBSCRIPTION_REQUIRED"}` for a USER without ACTIVE, and 200 with it.
- AC2.10: the admin `/dashboard/users` table shows the PENDING user with an "Activate" button. Clicking and confirming changes the badge to ACTIVE with the correct "Active until" date, without a page reload (query invalidation).

---

## Phase 3 — Business profile, EGS unit model, customers

**Scope:** the `Business` (seller), `EgsUnit` (schema only; onboarding is P6) and `Customer` models, the business context resolver, customer CRUD, and pages.

**Steps**
1. **Schema:**
   - `enum ZatcaEnvironment { SIMULATION PRODUCTION }`
   - `enum SellerIdScheme { CRN MOM MLS SAG OTH }`, plus `"700"` mapped as `S700` with `@map("700")`.
   - `enum BuyerIdScheme { TIN CRN MOM MLS SAG NAT GCC IQA PAS OTH }` plus `S700`.
   - `model Business`: `id`; `ownerId → User` (indexed, **not unique**); `nameEn`; `nameAr`; `vatNumber` (char 15); `sellerIdScheme`; `sellerIdValue`; `street`; `streetAr?`; `buildingNumber` (char 4); `additionalNumber?`; `district`; `districtAr?`; `city`; `cityAr?`; `postalCode` (char 5); `countryCode` default "SA"; `businessCategory`; `zatcaEnvironment` default SIMULATION; timestamps.
   - `enum EgsStatus { NEW COMPLIANCE_ISSUED ACTIVE FAILED REVOKED }`
   - `model EgsUnit`: `id`; `businessId → Business`; `environment`; `serialNumber` (unique; format `1-Fatoora|2-v2|3-<uuid>`); `commonName`; `functionalityMap` default "1100"; `status` default NEW; `privateKeyEnc?`; `csrPem?`; `complianceRequestId?`; `complianceCsidEnc?`; `complianceSecretEnc?`; `productionCsidEnc?`; `productionSecretEnc?`; `certificatePem?`; `certNotAfter?`; `lastIcv Int @default(0)`; `lastInvoiceHash String @default(<PIH seed>)`; `lastError String?`; timestamps.
     - Partial unique index: one non-REVOKED EGS per (businessId, environment).
   - `model Customer`: `id`; `businessId → Business` (indexed); `name`; `nameAr?`; `vatNumber?`; `buyerIdScheme?`; `buyerIdValue?`; `street?`; `buildingNumber?`; `additionalNumber?`; `district?`; `city?`; `postalCode?`; `countryCode` default "SA"; `email?`; `phone?`; timestamps.
2. **Contracts:** `src/contracts/business.ts` and `src/contracts/customers.ts` with Zod rules:
   - VAT `^3\d{13}3$`; buildingNumber `^\d{4}$`; postalCode `^\d{5}$`; nameAr requires an Arabic script character `\p{Script=Arabic}`; countryCode ISO alpha-2.
   - Customer rule (superRefine): if `vatNumber` is set, it must match the VAT regex and `buyerId*` must be empty. If `countryCode==='SA'` and the customer is used for STANDARD invoices, the full address is required. That last check is enforced at issue time in P7, and the form shows a hint.
3. **Business context:** `src/server/business/business-context.ts` → `resolveBusinessId(userId): Promise<string>`.
   - v1 returns the only Business owned by the user, and throws `BusinessRequiredError` (409, code `BUSINESS_REQUIRED`) if there is none.
   - Signature and comment document the later multi-business path (an `x-business-id` header validated against membership).
   - `http.ts`: `requireBusinessContext()` = `requireAppSession()` + `resolveBusinessId`.
4. **Services:**
   - `business.service.ts`: `getMine`, `upsertMine`. Create is allowed only when the user owns 0 businesses; otherwise update.
     - Changing `vatNumber` or `zatcaEnvironment` after an EGS reached ACTIVE → `ConflictError('BUSINESS_LOCKED_FIELDS')`.
   - `customers.service.ts`: list (cursor pagination via `pagination.ts`, search by name or VAT), get, create, update, delete.
     - Delete → `ConflictError('CUSTOMER_HAS_DOCUMENTS')` when documents reference it. Enforced by FK `onDelete: Restrict` in P4 and mapped from P2003.
     - Every query has `where: { businessId }`.
5. **API:**
   - `GET|PUT /api/app/business`
   - `GET|POST /api/app/customers`
   - `GET|PATCH|DELETE /api/app/customers/[id]`
   - Access to another business's customer returns 404 (not 403), so ids are not leaked.
6. **Pages:**
   - `/app/business` (bilingual form).
   - `/app/customers` (data-table list with search).
   - `/app/customers/new` and `/app/customers/[id]` (form).
   - The `/app` layout adds the app sidebar: Home, Invoices, Customers, Business, ZATCA.
   - Every `/app/*` page except `/app/business` redirects to `/app/business?setup=1` when `BUSINESS_REQUIRED`.

**Acceptance criteria**
- AC3.1: `PUT /api/app/business` with a valid body (VAT `300000000000003`, buildingNumber `1234`, postalCode `12345`, nameAr `شركة`) → 200. A second PUT updates the same row, and the user has exactly 1 Business.
- AC3.2: `PUT /api/app/business` with `vatNumber:"300000000000004"` → 400 with a field error on `vatNumber`. With `buildingNumber:"123"` → 400. With `nameAr:"Company"` → 400.
- AC3.3: `GET /api/app/customers` before any business exists → 409 `BUSINESS_REQUIRED`. The page `/app/customers` redirects to `/app/business?setup=1`.
- AC3.4: user A creates a customer. User B (with their own business) calling `GET /api/app/customers/<A's id>` → 404, `PATCH` → 404, `DELETE` → 404. User B's list does not include it.
- AC3.5: `POST /api/app/customers` with `vatNumber:"310000000000003"` and `buyerIdScheme:"CRN"` → 400 (both set). With only `buyerIdScheme:"NAT", buyerIdValue:"1234567890"` → 201.
- AC3.6: `resolveBusinessId` unit test: 0 businesses throws `BusinessRequiredError`, and 1 business returns its id. The function is the only place `ownerId` is read for scoping (`git grep -n "ownerId" src/server` lists only `business-context.ts` and `business.service.ts`).
- AC3.7: the default for a new Business is `zatcaEnvironment === 'SIMULATION'`.

---

## Phase 4 — Documents core (no ZATCA yet): VAT engine, drafts, numbering, print view

**Scope:**
- The `Document` and `DocumentLine` models for invoices and credit/debit notes.
- A pure VAT calculation engine.
- Draft CRUD.
- Issue-time numbering (P7 wires in the ZATCA step).
- List and detail pages.
- A bilingual print view.

**Steps**
1. **Schema:**
   - `enum DocumentKind { INVOICE CREDIT_NOTE DEBIT_NOTE }`
   - `enum DocumentSubtype { STANDARD SIMPLIFIED }`
   - `enum DocumentStatus { DRAFT ISSUED }`
   - `enum SubmissionStatus { NOT_SUBMITTED PENDING_RETRY REPORTED CLEARED REJECTED }`
   - `enum TaxCategory { S Z E O }`
   - `model Document`:
     - `id`; `businessId` (indexed); `kind`; `subtype`; `status` default DRAFT.
     - `sequence Int?`; `number String?`; `@@unique([businessId, kind, sequence])`.
     - `customerId?` (Restrict).
     - `buyerSnapshot Json?`; `sellerSnapshot Json?`.
     - `issueDate DateTime? @db.Date`; `issueTime String?`; `issuedAt DateTime?`; `supplyDate DateTime? @db.Date`; `supplyEndDate DateTime? @db.Date`.
     - `currency` default "SAR".
     - `paymentMeansCode String?`: UNTDID 4461; allowed `10` cash, `30` credit, `42` bank account, `48` bank card, `1` instrument not defined.
     - `docDiscountHalalas Int @default(0)`; `docDiscountReason String?`.
     - Totals (all Int halalas): `lineExtensionHalalas`, `allowanceTotalHalalas`, `taxExclusiveHalalas`, `taxHalalas`, `taxInclusiveHalalas`, `payableHalalas`.
     - `billingReferenceId String? → Document`; `noteReason String?`; `notes String?`.
     - ZATCA fields, nullable until P7: `egsUnitId?`, `uuid? @unique`, `icv Int?`, `pih String?`, `invoiceHash String?`, `signedXml String? @db.Text`, `clearedXml String? @db.Text`, `qrBase64 String? @db.Text`, `signingTime DateTime?`, `submissionStatus` default NOT_SUBMITTED, `hasWarnings Boolean @default(false)`, `zatcaResponse Json?`, `submissionAttempts Int @default(0)`, `lastAttemptAt DateTime?`.
     - `isTest Boolean @default(false)`: true when issued on a SIMULATION EGS.
     - Timestamps.
   - `model DocumentLine`:
     - `id`; `documentId` (Cascade); `position Int`; `description`; `descriptionAr?`.
     - `quantity Decimal @db.Decimal(18,6)`; `unitCode` default "PCE".
     - `unitPriceHalalas Int`; `lineDiscountHalalas Int @default(0)`.
     - `taxCategory`; `taxRateBp Int` (basis points; S=1500, others 0); `exemptionReasonCode String?`; `exemptionReason String?`.
     - `netHalalas Int`; `vatHalalas Int`; `totalHalalas Int`.
2. **Pure engine** `src/server/documents/vat-engine.ts`: `computeDocument(input) → {lines[], totals, taxSubtotals[]}`.
   - It uses decimal arithmetic on integers, with no floats. Quantity is converted to micro-units as a bigint.
   - `net = roundHalfUp(qty × unitPrice) − lineDiscount`.
   - `lineVat = roundHalfUp(net × rateBp / 10000)` (KSA-11).
   - `lineTotal = net + lineVat` (KSA-12).
   - Tax subtotal per (category, rate): `taxable = Σnet − allocated doc discount`, `tax = roundHalfUp(taxable × rateBp / 10000)`. The rate is computed at document level and is not the sum of line VAT (BT-110 rule).
   - Totals:
     - `lineExtension = Σnet`
     - `allowanceTotal = docDiscount`
     - `taxExclusive = lineExtension − allowanceTotal`
     - `tax = Σ subtotal tax`
     - `taxInclusive = taxExclusive + tax`
     - `payable = taxInclusive`
   - Constraints, each throwing a `ValidationError`:
     - A document-level discount is allowed only when all lines share one (category, rate). Otherwise it fails with `DOC_DISCOUNT_MIXED_CATEGORIES`, avoiding the unresolved ZATCA multi-category allowance case.
     - Z or E lines need an `exemptionReasonCode` from the allowed list (Appendix B).
     - O lines need free-text `exemptionReason` and rate 0.
     - S lines must have rate 1500.
     - `net >= 0`; `quantity > 0`; at least 1 line, at most 500.
3. **Contracts** `src/contracts/documents.ts`:
   - `documentDraftSchema` (kind, subtype, customerId?, supplyDate, supplyEndDate?, paymentMeansCode, docDiscount, lines[], billingReferenceId?, noteReason?).
   - Kind-specific superRefine:
     - CREDIT_NOTE and DEBIT_NOTE require `billingReferenceId` and `noteReason`. The referenced document must be an ISSUED INVOICE of the same subtype (checked in the service).
     - STANDARD requires `customerId` and `supplyDate`.
   - `documentListQuerySchema` (kind, status, submissionStatus, cursor, q).
4. **Service** `documents.service.ts`:
   - `createDraft`, `updateDraft` (only when `status==='DRAFT'`; otherwise `ConflictError('DOCUMENT_IMMUTABLE')`), `deleteDraft` (DRAFT only), `get`, `list`, `duplicateAsDraft(id)` (copies lines and customer into a new DRAFT; used to correct rejected documents).
   - All of these are scoped by `businessId` and run `computeDocument` server-side. Client totals are display-only.
   - `allocateNumber(tx, businessId, kind)`: `SELECT max(sequence) ... FOR UPDATE` on the Business row lock, then `sequence+1`. The number is `INV-000001`, `CN-000001` or `DN-000001` (zero-padded to 6, numeric sort by `sequence`).
   - Called only from P7's `issue`.
5. **API:**
   - `GET|POST /api/app/documents`
   - `GET|PATCH|DELETE /api/app/documents/[id]`
   - `POST /api/app/documents/[id]/duplicate`
6. **Pages:**
   - `/app/invoices`: list with tabs (All, Invoices, Credit notes, Debit notes) and filters by status and submission status.
   - `/app/invoices/new?kind=INVOICE|CREDIT_NOTE|DEBIT_NOTE`: RHF form with a line editor using the `product-form.tsx` pattern, a live totals preview from the shared pure `computeDocument` (safe to import client-side), a customer combobox, and an original-invoice picker for notes.
   - `/app/invoices/[id]`: detail.
   - `/app/invoices/[id]/print`: bilingual print view.
     - Arabic primary, `dir="rtl"`, English secondary.
     - Seller and buyer blocks, a line table, totals, VAT subtotals per category, and space for the QR.
     - Title per type: "فاتورة ضريبية / Tax Invoice" (STANDARD), "فاتورة ضريبية مبسطة / Simplified Tax Invoice" (SIMPLIFIED), and "إشعار دائن / Credit Note" and "إشعار مدين / Debit Note".
     - Prints via `window.print()` with print CSS.
     - DRAFT documents show the watermark "مسودة / DRAFT".

**Acceptance criteria**
- AC4.1 (VAT engine, `vat-engine.test.ts`): 1 line, qty `3`, price 3333 halalas, S/1500 → net 9999, line VAT 1500 (1499.85 rounded half-up), total 11499. Doc tax 1500, taxInclusive 11499.
- AC4.2: 3 S lines of net 1 halala each → each line VAT `roundHalfUp(0.15)=0`, but doc tax = `roundHalfUp(3×0.15=0.45)=0`. A 4-line variant with net 4 each → line VAT 1 each (0.6→1), doc tax `roundHalfUp(2.4)=2`. The test asserts doc tax 2 ≠ Σ line VAT 4, which proves document-level rounding.
- AC4.3: a doc discount of 1000 on lines all S/1500 with Σnet 10000 → taxExclusive 9000, tax 1350, payable 10350. The same discount with lines S and Z mixed → throws `DOC_DISCOUNT_MIXED_CATEGORIES`.
- AC4.4: a Z line without `exemptionReasonCode` → throws. A Z line with `VATEX-SA-32` → passes with VAT 0. An O line with rate 1500 → throws. Quantity `0.5`, price 199 → net `roundHalfUp(99.5)=100`.
- AC4.5: `POST /api/app/documents` with kind CREDIT_NOTE and no `billingReferenceId` → 400. With a `billingReferenceId` pointing to a DRAFT invoice → 409 `ORIGINAL_NOT_ISSUED`. With one from another business → 404.
- AC4.6: STANDARD INVOICE without `customerId` → 400. SIMPLIFIED without a customer → 201.
- AC4.7: the server ignores client totals. A POST with forged `taxHalalas: 1` stores the engine-computed value; the contract strips unknown fields.
- AC4.8: `PATCH` on a document whose `status` was set to ISSUED directly in the DB (test fixture) → 409 `DOCUMENT_IMMUTABLE`. `DELETE` → 409.
- AC4.9: `allocateNumber` under concurrency: 20 parallel issue-number allocations for one business/kind in a test yield sequences 1..20 with no duplicates or gaps. Numbers sort correctly (`INV-000009` < `INV-000010`).
- AC4.10: `/app/invoices/[id]/print` for a DRAFT renders `<html dir="rtl">` content with the Arabic title, all amounts formatted with 2 decimals, and the DRAFT watermark. Checked with the `run` skill plus a screenshot.

---

## Phase 5 — ZATCA crypto library (pure, Node-only)

**Scope:** `src/server/zatca/` holds pure functions with no Prisma, no Next and no network.

Modules:
- `xml/ubl-builder.ts`
- `xml/c14n11.ts`
- `hash.ts`
- `sign.ts`
- `qr.ts`
- `csr.ts`
- `certificate.ts`
- `time.ts`
- `codes.ts`
- `index.ts`

Plus the test harness.

**Steps** (`tdd`; the executor's agent re-reads the XML Implementation Standard v1.2, the Security Features Standard v1.2 and the Technical Guideline v2 from Appendix A before coding; the SDK samples are the structural reference)
1. **`codes.ts`:**
   - Type codes: INVOICE 388, CREDIT 381, DEBIT 383.
   - KSA-2 names: STANDARD `0100000`, SIMPLIFIED `0200000` (7 chars; positions 8 and 9 are unused, and staff confirmed 7 is valid).
   - Tax categories and the VATEX exemption list (Appendix B), payment means, scheme ids.
2. **`time.ts`:** `toZatcaDateTime(date) → {issueDate:'YYYY-MM-DD', issueTime:'HH:mm:ssZ', qrTimestamp:'YYYY-MM-DDTHH:mm:ssZ'}`, all UTC from one `Date`. `riyadhDisplay(date)` formats for print (UTC+3).
3. **`ubl-builder.ts`:** `buildUnsignedInvoiceXml(doc: ZatcaDocumentInput) → string`. `ZatcaDocumentInput` is a plain object (seller, buyer, lines, totals, uuid, icv, pih, kind, subtype, billingReference, reason, paymentMeans, supply dates). Element order follows the UBL 2.1 Invoice XSD sequence and the SDK samples:
   - UBLExtensions placeholder, ProfileID `reporting:1.0`, ID, UUID, IssueDate, IssueTime, InvoiceTypeCode (`name`), Note (reason for notes), DocumentCurrencyCode SAR, TaxCurrencyCode SAR.
   - BillingReference (notes).
   - AdditionalDocumentReference ICV, PIH, QR.
   - cac:Signature.
   - AccountingSupplierParty (PartyIdentification with schemeID, PostalAddress with StreetName, BuildingNumber, PlotIdentification (additional number), CitySubdivisionName, CityName, PostalZone, Country; PartyTaxScheme with CompanyID and VAT; PartyLegalEntity).
   - AccountingCustomerParty.
   - Delivery (ActualDeliveryDate, LatestDeliveryDate).
   - PaymentMeans (with InstructionNote = reason for notes).
   - AllowanceCharge (doc discount, ChargeIndicator false, with TaxCategory).
   - TaxTotal ×2: the first has only TaxAmount (SAR); the second has TaxSubtotal per category with TaxExemptionReasonCode/Reason.
   - LegalMonetaryTotal (LineExtensionAmount, TaxExclusiveAmount, TaxInclusiveAmount, AllowanceTotalAmount, PrepaidAmount 0, PayableAmount).
   - InvoiceLine ×n (InvoicedQuantity with unitCode, LineExtensionAmount, TaxTotal with TaxAmount and RoundingAmount, Item with Name and ClassifiedTaxCategory, Price with PriceAmount).
   - Amounts are formatted from halalas with exactly 2 decimals, `currencyID="SAR"`.
   - The builder uses `@xmldom/xmldom` and fixed namespace prefixes matching the samples.
   - The output is deterministic for the same input.
4. **`c14n11.ts`:** C14N 1.1 (no comments) over an xmldom document or subtree, for the subset UBL uses: elements, attributes, namespaces, text, no DTD, no PI.
   - Attribute sorting, namespace rendering (inherited only when used and not yet rendered by the output ancestor), text escaping (`&amp; &lt; &gt; &#xD;`), attribute escaping (`&quot; &#x9; &#xA; &#xD;`), empty elements as start and end tags.
5. **`hash.ts`:**
   - `computeInvoiceHash(xml) → base64`: parse, remove the 3 excluded nodes, drop the declaration, c14n11, SHA-256, base64 of the raw digest.
   - `PIH_SEED` constant.
6. **`sign.ts`:** `signInvoice({xml, privateKeyPem, certificatePem, signingTime}) → {signedXml, invoiceHash, signatureValue, qr?}`, following the guideline 5.2 order exactly:
   1. Compute the hash.
   2. ECDSA-SHA256 with `crypto.sign('sha256', Buffer.from(hashBase64 ... per the guideline), {key, dsaEncoding:'der'})`. The exact signed input (the raw hash bytes vs the base64 text) is settled by the golden test against the SDK samples' SignatureValue verification.
   3. Cert digest = base64(hex(SHA-256(cert DER))).
   4. Fill SignedProperties: SigningTime `YYYY-MM-DDTHH:mm:ss` (UTC), CertDigest, X509IssuerName in RFC 2253 order as printed in the SDK sample, X509SerialNumber as a decimal integer.
   5. SignedProperties digest over its serialization exactly as inserted.
   6. Insert the UBLExtensions signature block (template string from the SDK sample, byte-exact whitespace).
   7. Build the QR for SIMPLIFIED and insert it into the QR AdditionalDocumentReference.
   - The XML string is never re-serialized after step 6; insertion is by string splice at a marker.
7. **`qr.ts`:**
   - `buildQrTlv(fields) → base64`.
   - Tags 1–5 for all documents; 6 (hash text), 7 (signature base64 text), 8 (public key DER bytes), 9 (certificate signature bytes) for SIMPLIFIED.
   - The length byte must be ≤255, otherwise `ZatcaQrError('QR_FIELD_TOO_LONG')`. The total base64 must be ≤1000 chars, otherwise an error.
   - `parseQrTlv(base64)` for tests and display.
8. **`csr.ts`:** `generateKeyPair()` → secp256k1 PEM pair (`crypto.generateKeyPairSync('ec', {namedCurve:'secp256k1'})`).
   - `buildCsr({privateKey, publicKey, env, commonName, serialNumber, vatNumber, orgUnit, orgName, country:'SA', functionalityMap:'1100', registeredAddress, businessCategory}) → base64(PEM)`.
   - Built with pkijs/asn1js:
     - Subject: C, OU, O, CN.
     - Extension request: certificateTemplateName (OID 1.3.6.1.4.1.311.20.2, PrintableString `PREZATCA-Code-Signing` or `ZATCA-Code-Signing`) and subjectAltName dirName with SN (2.5.4.4), UID (0.9.2342.19200300.100.1.1), title (2.5.4.12), registeredAddress (2.5.4.26), businessCategory (2.5.4.15).
     - Signed ECDSA-SHA256 via `node:crypto`.
9. **`certificate.ts`:** parse the base64 binarySecurityToken → PEM (base64-decode, then wrap as a certificate); extract the public key DER (tag 8), the certificate signature (tag 9), the issuer name, the serial number and NotAfter.
10. **Test harness** (`src/server/zatca/__tests__/`):
    - Unit tests per module.
    - `golden.test.ts` loads `tools/zatca-samples/**/*.xml`. It is skipped with `describe.skipIf(!exists)` and logs "ZATCA SDK samples missing: copy *.xml from the SDK ZIP into tools/zatca-samples/". For each sample:
      - `computeInvoiceHash(sample)` equals the sample's `ds:Reference[@Id='invoiceSignedData']/ds:DigestValue`.
      - The sample's SignatureValue verifies with `crypto.verify` against its embedded certificate, using our hash input convention.
      - The SignedProperties digest recomputed by our code equals the sample's.
      - `parseQrTlv(sample QR)` tags 1–5 equal the XML fields (seller name, VAT, timestamp, TaxInclusiveAmount, TaxAmount) and tag 6 equals the computed hash.
    - `crosscheck.test.ts` (devDependency `zatca-xml-js`): for 3 fixtures (simplified invoice, standard invoice, simplified credit note), our `computeInvoiceHash` equals theirs for the same unsigned XML, and our TLV for the same inputs is byte-equal.
    - `roundtrip.test.ts`: generate a key and a self-signed test cert (secp256k1), build, sign and hash. Then: verify the signature, recompute the hash from the signed XML and compare it with the DigestValue, check the SignedProperties digest, and check the QR tags.

**Acceptance criteria**
- AC5.1: `computeInvoiceHash` equals the embedded `invoiceSignedData` DigestValue for **every** XML in `tools/zatca-samples/` (expected 6+: standard and simplified invoice, credit and debit). The test prints a count. Zero failures.
- AC5.2: for every sample, our SignedProperties digest equals the sample's `#xadesSignedProperties` DigestValue, and `crypto.verify` of the sample SignatureValue returns true.
- AC5.3: `crosscheck.test.ts` passes for all 3 fixtures (hash equality and TLV byte equality).
- AC5.4: `buildQrTlv` with seller name "شركة الاختبار" produces TLV tag 1 length = UTF-8 byte length (26), not the character count (13). A 256-byte value throws `QR_FIELD_TOO_LONG`.
- AC5.5: `buildCsr` output parsed back with `@peculiar/x509` has the curve `secp256k1`, signature algorithm `ecdsa-with-SHA256`, an extension with OID `1.3.6.1.4.1.311.20.2` whose value is `PREZATCA-Code-Signing` for SIMULATION and `ZATCA-Code-Signing` for PRODUCTION, and SAN dirName attributes SN, UID (= VAT), title (= `1100`), registeredAddress and businessCategory with the input values.
- AC5.6: `buildUnsignedInvoiceXml` for the same input called twice → identical strings. For a STANDARD credit note it contains `<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>`, a `cac:BillingReference` with the original number, and `cbc:InstructionNote` with the reason.
- AC5.7: `src/server/zatca/**` imports no `@prisma/client`, `next/*` or `@/lib/prisma`. Checked by `git grep -nE "prisma|from 'next" src/server/zatca` returning nothing.
- AC5.8: live verification of hashing and signing end to end happens in AC6.4 (the Simulation compliance checks). P5 is only complete once AC6.4 passes. If AC6.4 fails on hash or signature, the fix lands in this module.

---

## Phase 6 — Onboarding, ZATCA API client, encrypted credentials

**Scope:**
- `src/server/zatca/client.ts` (HTTP).
- `src/server/zatca/crypto-box.ts` (AES-GCM).
- `src/server/zatca/onboarding.service.ts`.
- The `/app/zatca` page.
- The `zatca:sim-check` script.

**Steps**
1. **`crypto-box.ts`:**
   - `encrypt(plain) → "v1:<ivB64>:<tagB64>:<ctB64>"` with a 12-byte random IV, using AES-256-GCM and the key from `env.ZATCA_ENCRYPTION_KEY` (32 bytes).
   - `decrypt(s)` checks the `v1` prefix (for future key rotation) and throws `CryptoBoxError` on tamper.
2. **`client.ts`:** `createZatcaClient(env: ZatcaEnvironment, fetchImpl = fetch)`.
   - Base `https://gw-fatoora.zatca.gov.sa/e-invoicing/${env==='PRODUCTION'?'core':'simulation'}`.
   - Methods:
     - `requestComplianceCsid(otp, csrB64)` → POST `/compliance` with the `OTP` header.
     - `checkCompliance(auth, {invoiceHash, uuid, invoice})` → POST `/compliance/invoices`.
     - `requestProductionCsid(auth, complianceRequestId)` → POST `/production/csids`.
     - `report(auth, payload)` → POST `/invoices/reporting/single`.
     - `clear(auth, payload)` → POST `/invoices/clearance/single` with header `Clearance-Status: 1`.
   - Every request sends `Accept-Version: V2`, `Accept-Language: en` and JSON. Timeout 30s via AbortController.
   - Returns `{httpStatus, body (raw JSON kept whole), outcome}`, where `outcome` is one of `PASS | WARNING | REJECTED | CLEARANCE_DISABLED | AUTH_ERROR | SERVER_ERROR | NETWORK_ERROR`. Mapping:
     - 200 → PASS
     - 202 → WARNING
     - 303 → CLEARANCE_DISABLED
     - 400 → REJECTED
     - 401/403 → AUTH_ERROR
     - ≥500 or 413 → SERVER_ERROR
     - fetch or abort errors → NETWORK_ERROR
   - Secrets never logged; a request logger redacts `Authorization` and `OTP`.
3. **`onboarding.service.ts`:** `onboard(businessId, otp)`:
   1. Load the Business. It must be complete: `businessComplete(business)`.
   2. Create or reuse the EGS for (business, env): status NEW or FAILED, a new UUID serial, CN = `${nameEn}-EGS`.
   3. `generateKeyPair`, then `buildCsr`, then `requestComplianceCsid`. Store `privateKeyEnc`, `csrPem`, `complianceRequestId`, `complianceCsidEnc`, `complianceSecretEnc` and `certificatePem` (from the token). Status COMPLIANCE_ISSUED.
   4. Generate 6 compliance documents from a synthetic fixture: a standard and a simplified invoice, a credit note referencing each invoice, and a debit note referencing each. Seller is this business; buyer is a fixed test buyer. ICV 1..6, chained PIH from the seed. Signed with the compliance cert. Call `checkCompliance` for each. All 6 must be PASS or WARNING with zero errors. On any REJECTED: status FAILED, `lastError` = the joined error messages, return them to the UI (the user must get a new OTP).
   5. `requestProductionCsid`. Store `productionCsidEnc`, `productionSecretEnc`, `certificatePem` (production cert) and `certNotAfter`. Reset `lastIcv=0` and `lastInvoiceHash=PIH_SEED`; the compliance documents are not part of the real chain. Status ACTIVE.
   6. Wrap DB steps in transactions. Network calls happen outside transactions, but each result is persisted immediately so a crash leaves a resumable state (COMPLIANCE_ISSUED can resume from step 4 without a new OTP, as long as the compliance CSID is valid).
4. **API:**
   - `GET /api/app/zatca` → `{environment, egs: {status, serialNumber, certNotAfter, lastError} | null}`. Never secrets.
   - `POST /api/app/zatca/onboard {otp: /^\d{6}$/}`. Rate-limited to 5 per hour per business via `rate-limit.ts`.
5. **Page** `/app/zatca`:
   - Shows the environment (SIMULATION or PRODUCTION, with a warning badge for SIMULATION: "Test mode – documents are not legal tax invoices"), step-by-step instructions with links to the Fatoora portal (production) and the Simulation portal, an OTP input, a progress display, and the error list.
   - Switching the environment is done on `/app/business`. It is allowed only while no EGS is ACTIVE for the new environment and creates a separate EGS.
   - A banner appears when `certNotAfter` is less than 30 days away. Renewal itself is out of scope.
6. **Script** `scripts/zatca-sim-check.ts` (`npm run zatca:sim-check -- --otp 123456`):
   - Runs against SIMULATION using a throwaway EGS for the seed business (or a `--business-id`).
   - Executes the onboarding steps 2–4, prints a table of the 6 results with HTTP status, outcome and validationResults (infos, warnings, errors), and exits non-zero on any error or warning.
   - Records raw responses to `tools/zatca-sim-recordings/<timestamp>/` (gitignored) for fixtures.
7. Run the `security-review` skill on the Phase 6 diff.

**Acceptance criteria**
- AC6.1: the `crypto-box` round-trips a 2 KB PEM. Flipping one byte of the ciphertext throws `CryptoBoxError`. Two encryptions of the same plaintext differ (random IV).
- AC6.2: `client.test.ts` with a mocked `fetch` maps 200/202/303/400/401/500 and an abort to the 7 outcomes listed. Headers include `Accept-Version: V2`, `Authorization: Basic base64(token:secret)`, and `OTP` only on `/compliance`. The redacting logger output contains neither the secret nor the OTP.
- AC6.3: `GET /api/app/zatca` after onboarding returns a body whose JSON string contains none of `privateKey`, `secret`, `BEGIN`, or the encrypted value prefix `v1:` (asserted in a test). DB columns `privateKeyEnc` and `productionSecretEnc` start with `v1:`.
- AC6.4 (**live gate, run by the user with a real Simulation OTP**): `npm run zatca:sim-check -- --otp <OTP>` prints 6 rows, all `PASS` with `errors: 0` and `warnings: 0`, then exits 0. If it fails, iterate on the P5 code until it passes. This is the authority for the hash, signature, QR, CSR and XML rules.
- AC6.5: the full in-app `POST /api/app/zatca/onboard` with a real Simulation OTP → the EGS reaches `status ACTIVE` with `certNotAfter` set, `lastIcv 0` and `lastInvoiceHash = PIH_SEED`. The `/app/zatca` page shows "Active".
- AC6.6: onboarding with an invalid OTP (`000000`) → the EGS status is FAILED with `lastError` containing ZATCA's error text, the UI shows it, and no secret is persisted unencrypted.
- AC6.7: a 6th `POST /api/app/zatca/onboard` in one hour → 429.
- AC6.8: the `security-review` skill run on the P6 diff reports no HIGH findings. Any MEDIUM finding is fixed or explicitly listed in the PR.

---

## Phase 7 — Issuance pipeline, submission, retry, notes, outputs

**Scope:**
- `issuance.service.ts`: issue, submit and retry.
- The cron route.
- Wiring the print view to the QR.
- XML download.
- Credit/debit note issuance (same path).
- The 24h warning banner.

**Steps**
1. **`issue(businessId, documentId, now)`.** This step runs in one `prisma.$transaction`, with `isolationLevel: 'Serializable'` not required because explicit locks are used.
   1. `SELECT ... FROM "EgsUnit" WHERE businessId=$1 AND environment=$env AND status='ACTIVE' FOR UPDATE`. None → `ConflictError('ZATCA_NOT_ONBOARDED')`.
   2. Load the DRAFT document with `FOR UPDATE`; it must be DRAFT, otherwise `DOCUMENT_IMMUTABLE`.
   3. Validate issue-time rules:
      - STANDARD: the buyer has a name, VAT or a buyer ID, and an address (street, city, country; if SA, also building number, postal code and district) → `ValidationError` listing the missing fields.
      - Notes: the original is ISSUED and of the same subtype.
      - `supplyDate <= issueDate`.
   4. Snapshot the seller (Business) and the buyer (Customer) into JSON.
   5. `allocateNumber`, `uuid = randomUUID()`, `icv = egs.lastIcv + 1`, `pih = egs.lastInvoiceHash`, and the timestamps from `toZatcaDateTime(now)`.
   6. `buildUnsignedInvoiceXml`, then `signInvoice` with the production key and cert (decrypted in memory only).
   7. Update the document: status ISSUED, all ZATCA fields, `submissionStatus PENDING_RETRY`, `isTest = env==='SIMULATION'`.
   8. Update the EGS: `lastIcv = icv`, `lastInvoiceHash = invoiceHash`.
   9. Commit.
2. **`submit(documentId)`** runs after commit, outside the transaction.
   - Payload `{invoiceHash, uuid, invoice: base64(signedXml)}`.
   - SIMPLIFIED → `report`. STANDARD → `clear`; if the result is CLEARANCE_DISABLED (303), fall back to `report`.
   - Outcomes:
     - PASS: `REPORTED`, or `CLEARED`, in which case store `clearedXml` (base64-decoded `clearedInvoice` from the body) and extract its QR into `qrBase64`.
     - WARNING: same status with `hasWarnings=true`.
     - REJECTED: `REJECTED`.
     - NETWORK_ERROR or SERVER_ERROR: stays `PENDING_RETRY`.
     - AUTH_ERROR: stays `PENDING_RETRY`, and the EGS `lastError` is set (the UI shows "re-onboard required").
   - Every attempt increments `submissionAttempts`, sets `lastAttemptAt` and stores the raw body in `zatcaResponse`.
   - A REJECTED document is final. The UI offers "Create corrected copy", which calls `duplicateAsDraft`. The chain is never rolled back.
3. **API:**
   - `POST /api/app/documents/[id]/issue` → runs issue then submit, and returns the document with `submissionStatus`. HTTP 200 even if ZATCA rejected it (the status is in the body). 409 or 400 for pre-issue failures.
   - `POST /api/app/documents/[id]/retry`: only when PENDING_RETRY.
   - `GET /api/app/documents/[id]/xml` → `application/xml` attachment `<number>.xml`. Serves `clearedXml ?? signedXml`; ISSUED only.
4. **Cron:** `GET /api/cron/zatca-retry`.
   - Requires `Authorization: Bearer ${CRON_SECRET}`.
   - Retries up to 50 PENDING_RETRY documents ordered by `issuedAt`, sequentially.
   - `vercel.json` cron `0 3 * * *` (daily on Hobby; change to hourly `0 * * * *` on Pro).
5. **UI:**
   - The detail page shows a submission badge (Reported, Cleared, Rejected with error list, Pending retry with a Retry button, Warnings list).
   - Print is enabled for SIMPLIFIED once ISSUED, and for STANDARD only when CLEARED. Otherwise it is disabled with the reason.
   - The print view renders the QR image from `qrBase64` via `qrcode` (`toDataURL` of the base64 TLV string), the number, the UUID, and the issue date/time in Riyadh time (display only). `isTest` documents carry the watermark "SIMULATION – ليست فاتورة ضريبية".
   - The `/app` home banner shows the count of SIMPLIFIED documents in PENDING_RETRY with `issuedAt` older than 18h ("Report before 24h deadline"), linking to a filtered list.
6. **Credit and debit notes:** the same `issue` path with kind CN/DN. The original is fetched in the transaction, `BillingReference` = the original's number, and `noteReason` maps to `InstructionNote`. The original stays untouched.

**Acceptance criteria**
- AC7.1: issue a SIMPLIFIED invoice (mock client → PASS) → the document has `status ISSUED`, `number INV-000001`, `icv 1`, `pih = PIH_SEED`, a non-null `invoiceHash`, a `signedXml` containing `<cbc:UUID>` = `uuid`, `submissionStatus REPORTED`. The EGS has `lastIcv 1` and `lastInvoiceHash = doc.invoiceHash`.
- AC7.2: issue a second document → `icv 2`, `pih` = the first document's `invoiceHash`, `number INV-000002`. A credit note referencing invoice 1 → `icv 3`, `number CN-000001`, and the XML contains BillingReference `INV-000001`.
- AC7.3 (concurrency): 10 parallel `issue` calls on 10 drafts of one business (mocked network) → ICVs exactly 1..10, each document's `pih` equals the `invoiceHash` of the document with `icv-1` (seed for icv 1), and no duplicate numbers. Test `issuance.concurrency.test.ts`.
- AC7.4: a mock NETWORK_ERROR on submit → the document is ISSUED with `PENDING_RETRY`, `submissionAttempts 1`, and `signedXml` persisted. `POST /retry` with the mock returning PASS → `REPORTED`, `submissionAttempts 2`. `POST /retry` on a REPORTED document → 409.
- AC7.5: a mock REJECTED (400 with errors) → `REJECTED`, with errors in `zatcaResponse`. The EGS chain is still advanced (`lastIcv` incremented). "Create corrected copy" creates a new DRAFT with the same lines, and issuing it gets the next ICV with `pih` = the rejected document's hash.
- AC7.6: STANDARD with the mock returning PASS and a `clearedInvoice` → `CLEARED`, `clearedXml` stored, `qrBase64` = the QR value parsed from the cleared XML. A mock 303 → falls back to `report`, ending REPORTED.
- AC7.7: issuing a STANDARD invoice whose customer has no address and `countryCode SA` → 400 listing `buildingNumber`, `postalCode`, `district`, `street` and `city`. The document stays DRAFT, and the EGS `lastIcv` is unchanged.
- AC7.8: issuing a document while the business has no ACTIVE EGS → 409 `ZATCA_NOT_ONBOARDED`.
- AC7.9: `GET /api/cron/zatca-retry` without the bearer → 401. With the bearer → 200 `{processed: n}`. PENDING_RETRY documents are retried oldest first, at most 50.
- AC7.10: `GET /api/app/documents/[id]/xml` for an ISSUED SIMPLIFIED document → 200, `Content-Type: application/xml`, `Content-Disposition` with `INV-000001.xml`, and the body equals `signedXml` byte for byte. For a DRAFT → 409. For another business's document → 404.
- AC7.11 (**live, user-run, Simulation**): with the EGS onboarded in AC6.5, issue in the UI:
  - 1 simplified invoice, then a simplified credit note against it.
  - 1 standard invoice to a complete SA customer, then a standard debit note against it.
  - All 4 end REPORTED or CLEARED with `hasWarnings false`.
  - The printed simplified invoice's QR, scanned with the ZATCA VAT app, shows the correct total (tag 4).
  - Then force one rejection (for example a standard invoice to a customer with an invalid VAT number inserted directly in the DB) and issue the next valid document → the next document is accepted. This proves the PIH-after-rejection behaviour.
- AC7.12: the print view for a STANDARD document that is not CLEARED is disabled with the text "Awaiting ZATCA clearance". For a CLEARED one, it shows the QR from the cleared XML.
- AC7.13: the home banner appears in a test with a SIMPLIFIED PENDING_RETRY document whose `issuedAt` is 19h ago, and does not appear at 17h.

---

## Phase 8 — Cross-Validation

**Steps**
1. `npx tsc --noEmit`, `npx dotenv -e .env.dev -- npx vitest run` (all suites, golden tests included with samples present), and `npx dotenv -e .env.dev -- next build`.
2. Use the `run` skill to drive these end-to-end flows on a fresh local DB:
   1. Signup and verify.
   2. `/plans` request.
   3. Admin activation.
   4. Business profile.
   5. Customer.
   6. ZATCA onboarding (Simulation, real OTP from the user).
   7. Issue the 4 documents from AC7.11.
   8. Print and download the XML.
   9. Expiry: set `endsAt` in the past in the DB and confirm the redirect to `/plans`.
3. Re-run `npm run zatca:sim-check` and require exit 0.
4. Reconcile every AC (0.1 through 7.13) in a checklist table in the PR description, each marked pass or fail with evidence (test name, screenshot or command output).
5. Reconcile against the original requirements:
   - Category → Customer and Product → Invoice mapping.
   - Roles ADMIN/USER.
   - Signup with verification.
   - 4 plan cards that only POST.
   - Admin list with activation.
   - The gate.
   - Invoices, customers and profile.
   - Phase 2 QR.
   - Origin overwritten.
6. Run the `code-review` skill at `high` on `dev...main`. Fix CONFIRMED findings.
7. Open a PR `dev` → `main` per `git-hygiene`.

**Acceptance criteria**
- AC8.1: all three commands in step 1 exit 0. The test output shows the golden suite ran (not skipped).
- AC8.2: `zatca:sim-check` exit 0 (6/6 PASS, 0 warnings).
- AC8.3: the end-to-end checklist has every item passed, with screenshots attached for the plans, admin users, invoice print (simplified, with the QR) and ZATCA pages.
- AC8.4: `code-review` has no unresolved CONFIRMED findings.

## Out of scope (v1)
- Payment gateway and automatic activation. Admin rejection or cancellation of requests, and emails on activation.
- Multi-business UI and memberships. The schema and services are prepared via `businessId` scoping and `resolveBusinessId`.
- PDF/A-3 with embedded XML. Shortcut: browser print plus signed XML download; upgrade when buyers require PDF delivery.
- CSID renewal. Shortcut: a banner 30 days before `certNotAfter`; upgrade before the first certificate nears expiry.
- VAT-inclusive price entry, multi-currency, prepayment invoices (386), summary, export, third-party, nominal and self-billed flags, and KSA-2 positions 8 and 9 (continuous supply, B2G).
- A document-level discount across mixed tax categories. Shortcut: rejected with `DOC_DISCOUNT_MIXED_CATEGORIES`; upgrade when ZATCA clarifies (forum topic 10830).
- A queue service. Shortcut: synchronous submit plus manual Retry plus a daily cron; upgrade to hourly on Vercel Pro or to QStash when volume grows.
- Logo upload (Cloudinary removed), invoice email to buyers, Arabic UI chrome (only the print view is bilingual), and analytics.
- Moving crypto to a worker or Lambda. The `src/server/zatca/` purity (AC5.7) keeps that a move, not a rewrite.

## Rollback
- **Phase 0, before the force push:** delete `C:\Users\muhammad\Desktop\fatoora-saas-v2`; nothing remote changed.
- **After the push:** restore the old origin with `git push --force origin <bundle-ref>:main`, run from a clone of `..\fatoora-saas-v2-origin-backup-93792d2.bundle`.
- **Phases 1–7:** each phase is a feature branch PR into `dev`. Abandon by closing the PR and running `git branch -D <branch>` (and `git push origin --delete <branch>`). `dev` remains at the last merged phase, and a merged phase can be reverted with `git revert -m 1 <merge-sha>`.
- **DB:** local `fatoora_v2` can be dropped and recreated with `prisma migrate reset` (local only; the db guard blocks remote). Production DB migrations are applied only after Phase 8.

## Appendix A — Authoritative sources
- XML Implementation Standard v1.2: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf
- Security Features Implementation Standards v1.2: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf
- Data Dictionary: https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_EInvoice_Data_Dictionary%20vF.xlsx
- Detailed Technical Guideline v2: https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf
- Developer Portal Manual: https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/DEVELOPER-PORTAL-MANUAL.pdf
- Fatoora Portal User Manual: https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/Fatoora_Portal_User_Manual_English.pdf
- SDK download (samples): https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
- Staff posts: https://zatca1.discourse.group/t/7836 (host), /t/9740 (sandbox deprecated, simulation), /t/4028 (CSR config), /t/7826 (SDK 3.4.3 KSA-2), /t/7533 (BR-KSA-98)
- Cross-check implementation: https://github.com/wes4m/zatca-xml-js (MIT)

## Appendix B — Exemption reason codes
- E (exempt): `VATEX-SA-29`, `VATEX-SA-29-7`, `VATEX-SA-30`
- Z (zero-rated): `VATEX-SA-32`, `VATEX-SA-33`, `VATEX-SA-34-1`…`VATEX-SA-34-5`, `VATEX-SA-35`, `VATEX-SA-36`, `VATEX-SA-EDU`, `VATEX-SA-HEA`, `VATEX-SA-MLTRY`
- O (out of scope): `VATEX-SA-OOS` plus free text

The executor verifies this mapping against the Data Dictionary xlsx in Phase 5 step 1. `EDU` and `HEA` additionally require buyer scheme NAT, which is enforced at issue.

## Open decision — admin visibility of business data (noted 2026-10-14)

Current behavior (as planned): users see only their own business's customers/invoices (scoped by `businessId`, other business → 404). Admins see ONLY the users list + subscription status/activation. `/api/app/*` requires role `USER`; an ADMIN opening `/app` is redirected to `/dashboard`. Roles are only `ADMIN` and `USER` (no separate super admin; admins are seed-created).

Why: issued documents are the businesses' own legal ZATCA records; platform-owner read access is a privacy decision, so it was left out until requested.

Status 2026-10-14: user chose to DEFER this ('keep it in the note, don't code'). Nothing implemented. Decision pending (owner: user): keep admin = users + subscriptions only, OR add read-only admin pages for business profiles, customers and invoices (with ZATCA status), never exposing encrypted keys/CSID secrets, no edit/issue on behalf of a business. If chosen: small add-on after Phase 7 (admin read routes under `/api/admin/**` with `requireAdminSession()`, pages under `/dashboard`); data is already scoped by `businessId`, so no schema change. If a super-admin tier is wanted, add a `SUPER_ADMIN` enum value (touches role checks in `http.ts`, `proxy.ts`, dashboard layout).

## Execution Progress

**Status: in progress**

_Last updated: 2026-10-14 — Branch: main (P0), then feature/* from dev — Workspace: main working directory_

Final commit list: —

| Phase | Status | Commit | Review | Notes |
| --- | --- | --- | --- | --- |
| 0. Bootstrap | done | `2c65bf0` | deferred | agent: general-purpose. AC0.2/0.3/0.5 pass; AC0.4 see deviations; AC0.1 = user's force push (pending). npm audit: 37 vulns inherited from gadget. |
| 1. Strip + rebrand | done | `277afb4` (merge `13a9d4a`) | deferred | agent: general-purpose. 11 commits. Not run: lint (known broken), browser UI flows (AC1.7/1.8 verified via curl/service). Resumed once after API session limit. |
| 2. Subscriptions | done | `bacd3ee` (merge `6df9daa`) | deferred | agent: general-purpose. 6 commits. Not run: mobile-width screenshots, plan-card click submit (request made via curl), security review. |
| 3. Business + customers | done | `fcfd65a` (merge `501f631`) | deferred | agent: general-purpose. 9 commits; resumed once after API limit. dev now: tsc OK, 246 tests pass. Not run: mobile width, dark mode/keyboard, security review; CUSTOMER_HAS_DOCUMENTS untested until P4 FK. |
| 4. Documents core | done | `1ff40f7` (merge `28109f3`) | deferred | agent: general-purpose. 5 commits. dev: tsc OK, 312 tests pass, migrations up to date. Not run: desktop-width, note/original-picker + discount/exemption UI in browser, build, real print/PDF. |
| 5. ZATCA crypto lib | done (AC5.8 open → AC6.4) | `1743b95` (merge `ae41c5e`) | deferred | agent: general-purpose. 16 commits. Not run: full suite, build, live ZATCA, golden vs real SDK samples (skipped). |
| 6. Onboarding + client | done offline; live gate pending | `bba2c99` (merge `51031c2`) | deferred | agent: general-purpose. 8 commits. AC6.4/6.5 = USER live Simulation run (steps in docs/context/07-zatca-onboarding.md). security-review skill failed to launch (no merge base vs origin/HEAD) → manual diff review, no HIGH; formal /security-review to run in Cross-Validation. Page never rendered in browser. |
| 7. Issuance pipeline | done offline; live AC7.11 pending | merge `a90319a` | deferred | agent: general-purpose. 6 commits. 344 tests, tsc OK, one next build OK. Not run: live ZATCA happy path, QR scan, mobile, formal security review, real print. One real Simulation call with fake creds → 401 handled. |
| Cross-Validation | done (fixes merged; live gates pending) | `740c4aa` (merge on dev) | 1 review pass, 20 findings: 5 must + 11 should fixed, 4 deferred | tsc OK, 390 tests, build OK (with dummy RESEND vars), migrations up to date, purity grep empty. Fixes were not re-reviewed by a second agent. |

Execution decisions (user-approved 2026-10-14): phase branches are based on local `dev` (not `main`) and merged `--no-ff` into local `dev` after ACs pass; nothing pushed without a per-push yes; force push of `main` run by the user. Parallel lanes after P1: Lane A P2→P3→P4 (shared schema), Lane B P5 in a separate worktree; P6 after P3+P5; P7 after P4+P6. Commits carry no attribution trailers (repo git-hygiene rule).

### Phase 0 — Bootstrap

- [ ] AC0.1: pending user force push.
- [x] AC0.2: bundle verify exit 0 (`..\fatoora-saas-v2-origin-backup-93792d2.bundle`).
- [x] AC0.3: ls-files grep empty.
- [~] AC0.4: 30 matches, all placeholders/fixtures (`.env.example` postgres:postgres@localhost, db-target test fixtures, this plan's own regex line). Agent compared all real values from gadget `.env`/`.env.dev` against staged files: none present.
- [x] AC0.5: gadget-website status identical (empty) before/after, HEAD 9c14d44.
- Deviations: AC0.4 regex self-matches the plan; accepted on manual comparison. No attribution trailers per git-hygiene.

### Phase 4 — Documents core

- [x] AC4.1-AC4.4: vat-engine.test.ts (11 tests).
- [x] AC4.5-AC4.8: route + service tests.
- [x] AC4.9: 20 parallel allocateNumber → 1..20 no gaps; numeric sort.
- [x] AC4.10: browser DOM + screenshots (mobile width only).
- Orchestrator re-ran on merged dev: tsc OK, 312 tests, migrate status up to date.
- Deviations: plan assumption `onDelete: Restrict` false (SQLSTATE 23001 not mapped by Prisma) → `NoAction` (second migration); tsconfig target ES2017→ES2020 (bigint); tax subtotals grouped per (category, rate, exemption reason); 422 for validation; amount cap AMOUNT_TOO_LARGE; notes must reference same-subtype INVOICE. Merge conflict in docs/context/05-frontend.md resolved by keeping both lines.

### Phase 5 — ZATCA crypto lib

- [~] AC5.1/AC5.2: golden test skipped pending `tools/zatca-samples/`; ran once against the SDK-derived sample shipped in zatca-xml-js (1/1, all digests + signature match), then removed.
- [x] AC5.3: crosscheck vs zatca-xml-js, 3 fixtures (hash + QR byte-equal).
- [x] AC5.4: tag 1 = 25 UTF-8 bytes (plan said 26 — plan arithmetic error); 256-byte value throws.
- [x] AC5.5: CSR parse-back for both envs.
- [x] AC5.6: deterministic builder; standard CN content.
- [x] AC5.7: purity grep empty (orchestrator re-ran).
- [ ] AC5.8: open until AC6.4.
- Orchestrator re-ran: tsc OK; src/server/zatca 59 pass / 1 skipped.
- Deviations (evidence-driven, matched to SDK-signed sample + ZATCA staff forum t/717): cert digest = base64(hex(SHA-256(cert base64 text))); SignedProperties digest = base64(hex(SHA-256)) over fixed serialization; SigningTime with Z; standard docs carry 9-tag QR (replaced at clearance); string writer for XML (xmldom parse only); inclusive C14N 1.1; xpath dropped; @peculiar/x509 dev-only. Pending Simulation confirmation: SIGNATURE_INPUT raw hash bytes, IssueTime Z, cbc:Note on notes, line allowance placement, empty buyer party for simplified, X509IssuerName format.

### Phase 2 — Subscriptions

- [x] AC2.1: 201 PENDING (service, route test, curl).
- [x] AC2.2: 409 SUBSCRIPTION_PENDING; parallel race test → 1 row (partial unique index is sole guard).
- [x] AC2.3: 401 anon, 403 admin; invalid plan → 422 (see deviation).
- [x] AC2.4: Jan 31 + 1 month → Feb 28 (service test).
- [x] AC2.5: 409 / 404 / 401-403.
- [x] AC2.6: stacking dates (service test).
- [x] AC2.7: NONE/PENDING/ACTIVE/EXPIRED tests.
- [x] AC2.8: redirects verified via curl + Chrome.
- [x] AC2.9: /api/app/ping 402 / 200.
- [x] AC2.10: Chrome click-through, no reload.
- Orchestrator re-ran: tsc OK; subscriptions tests 20/20.
- Deviations: Zod validation errors return 422 (repo `jsonError` convention) where plan says 400 — applies to all later "400 validation" ACs. Admin create/update user routes + contract removed (admins seed-created). Login redirect done via server redirect on `/`.

### Phase 1 — Strip + rebrand

- [x] AC1.1: tsc exit 0 (orchestrator re-ran).
- [x] AC1.2: vitest 16 files / 148 tests pass (orchestrator re-ran).
- [x] AC1.3: next build exit 0 (agent).
- [x] AC1.4: grep rc=1 (orchestrator re-ran).
- [x] AC1.5: single `20261013225758_init`; db:status up to date.
- [x] AC1.6: money.test.ts cases pass.
- [x] AC1.7: admin credentials login 302 → /dashboard via curl (not browser).
- [x] AC1.8: signup USER + devCode, unverified login refused, verifyEmail via service script (UI not exercised).
- [x] AC1.9: USER → /dashboard 307 to login; /api/admin/users 401.
- Deviations: extra leftover-file deletions per user instruction (unused UI primitives, public/ images, seo/marketing skills, unused deps, backfill script); redis key prefix `gw:` → fatoora; nav-secondary removed. First commit 8fddf5c does not typecheck alone (fixed by 89b15b5). Carry to cross-validation: local .env.dev points at user's remote Upstash (fail-open timeouts); avatars with remote URLs (no image hosts) logged in KNOWN-ISSUES.


## Cross-Validation decisions (user, 2026-10-14)
- Expired subscribers keep READ-ONLY access to already-issued records (xml, list/detail, print); all writes stay gated. Implemented in branch fix/cross-validation-findings.
- No product/service catalog: invoice lines stay free text (by design).
- Leftover workflow skills dropped (.claude/skills: execute-with-me, plan-with-me, handoff, thermo-nuclear-code-review, openai.yaml files); kept git-hygiene, code-review, grilling, supercharged-*.
- Admin visibility of business data: deferred, see Open decision section.
- Reviewer items deferred (not implemented): unbounded admin users list (17), rate limits on issue/create/retry (18), Origin check CSRF hardening (19).


## Final Status

**Status: COMPLETE offline, ready for PR (dev → main); live ZATCA gates pending the user.** (2026-10-14)

Shipped on local `dev` (nothing pushed): P1 strip+rebrand, P2 subscriptions, P3 business/EGS/customers, P4 documents core, P5 ZATCA crypto lib, P6 onboarding + client, P7 issuance pipeline, plus `fix/cross-validation-findings` (security/correctness fixes, expired-subscriber read-only access, leftover deletions).

Verified: `tsc --noEmit --incremental false` OK; vitest 390 pass / 1 skipped (golden, no samples); `next build` OK with dummy `RESEND_API_KEY`/`EMAIL_FROM`; `prisma migrate status` up to date (8 migrations); `src/server/zatca` purity grep empty.

Pending (user): (1) force-push `main` over origin 93792d2 (AC0.1) then push `dev`; (2) copy SDK sample XMLs to `tools/zatca-samples/` to un-skip golden tests (AC5.1/5.2); (3) live Simulation: `npm run zatca:sim-check -- --otp <OTP>` (AC6.4), in-app onboarding (AC6.5), AC7.11 steps in docs/context/07-zatca-onboarding.md; (4) set RESEND_API_KEY/EMAIL_FROM, ZATCA_ENCRYPTION_KEY, CRON_SECRET, NEXTAUTH_* in Vercel (all envs incl. previews) and a new prod Prisma Postgres + `migrate deploy`; (5) rotate gadget-website NEXTAUTH_SECRET if prod uses the placeholder; (6) decisions: admin visibility, deferred hardening (admin users pagination, issue rate limits, Origin/CSRF check).

Assumptions to confirm at the Simulation gate: SIGNATURE_INPUT raw hash bytes, SigningTime with Z, IssueTime Z, 9-tag QR on standard docs, X509IssuerName format, response field names, duplicate-response shape (409 / 400 'duplicate|already' → DUPLICATE), clearance 200 = CLEARED.

## Live ZATCA run — info needed from user (noted 2026-10-14)

Portal: need the **Fatoora portal, Simulation environment** ("Onboard new solution unit" → OTP). Developer Portal sandbox is deprecated and unusable here (Developer Portal login only needed to download the SDK ZIP for sample XMLs).

A. Access: which portal is reachable; taxpayer registered in Simulation; VAT group? (11th digit of VAT = 1 → need member 10-digit TIN).
B. Taxpayer data exactly as in portal: 15-digit VAT (starts+ends 3); Arabic registered name; English name; seller ID type+value (CRN/MOM/MLS/700/SAG/OTH); national address (building 4 digits, street, district, city, postal 5 digits, additional number); business category. Decide: I create the local business record, or user enters it in the app.
C. Scope: standard + simplified both (functionality map 1100)? Two test customers: valid Saudi B2B (valid VAT + full address) and one deliberately invalid VAT (forced-rejection test).
D. OTP: generate only when ready (1h, single use; request 2-3). User runs `! npm run zatca:sim-check -- --otp <OTP>` locally and pastes output / newest `tools/zatca-sim-recordings/<ts>/` files back.
E. Samples: download SDK ZIP, copy only *.xml into `tools/zatca-samples/` (un-skips golden tests).
F. ZATCA VAT phone app available to scan the simplified QR (tag 4 = total)?
G. Windows clock synced; OK to use real TRN in Simulation (docs print with SIMULATION watermark).

Order: answer A-C → samples (E) → OTP run → iterate on recordings until 6/6 PASS, 0 warnings → in-app onboarding (AC6.5) → 4 live invoices + QR scan + forced rejection (AC7.11).
Network check 2026-10-14: gw-fatoora.zatca.gov.sa/e-invoicing/simulation reachable (HTTP 405 to GET = expected).


## Sandbox verification (2026-10-14)

User has no taxpayer credentials for the Fatoora/Simulation portals, so AC6.4/AC7.11 are blocked on a taxpayer account. Dev-only `npm run zatca:sandbox-check` (branch merged to dev) runs against the ZATCA Developer Portal sandbox (`/e-invoicing/developer-portal`, OTP 123345, template TSTZATCA-Code-Signing, synthetic VAT 399999999900003). Result (orchestrator re-ran): 6/6 compliance documents HTTP 200 PASS, 0 errors, 0 warnings; production CSID, reporting (REPORTED) and clearance (CLEARED + clearedInvoice) all 200. Tamper tests (agent): wrong hash, altered signature/QR, missing QR/ProfileID are rejected with the expected codes, so the sandbox validates hash/signature/QR/BR-KSA rules for real. Response shapes recorded in docs/context/07-zatca-onboarding.md ("Sandbox findings"); parsers match.
Still unverified (only Simulation/Production can show): ICV/PIH chain acceptance, real certificate-chain/taxpayer VAT checks, DUPLICATE response shape (sandbox is stateless), 202 warnings / 303, Simulation CSR template `PREZATCA-Code-Signing`, CN/OU/address/businessCategory acceptance, rate limits. Sandbox is called deprecated by ZATCA staff and may vanish.
