# Plan: Playwright E2E smoke suite

## Summary

Add `@playwright/test` with a smoke suite over 7 core flows. It runs locally against an isolated `gadget_e2e` DB and a dedicated dev server on port 3100. It replaces costly manual agent browser checks and guards core flows during spec-driven development. Test titles carry `[E2E-AREA-NN]` IDs for spec traceability.

**Approach.** Self-contained env injected by Playwright config, DB wiped per run. Chosen over reusing the unmerged dev-env branch (blocks on its merge) and over a Vercel preview target (needs hosted DB and CI).

**Skills for executor:** `git-hygiene`, `ecc:e2e-testing`, `ecc:prisma-patterns`, `ecc:nextjs-turbopack`, `ecc:verification-loop`, `supercharged-executor`, `tdd` (guard spec), `code-review` (final review).

## Context and findings

- Playwright is still absent (checked 2026-10-13): no dep, no config, no `e2e/` dir, no `.github/` (so no CI workflows, and the PR template was removed in `e1c0f30`), no `vercel.json`. `docs/product/SCALE-UP-TODO.md:70` lists the e2e smoke item.
- `npm run dev`, `npm test` and the `db:*` scripts now load `.env.dev` through `dotenv-cli`, and a localhost guard (`scripts/assert-db-target.ts` via npm `pre` hooks, `vitest.global-setup.ts` for tests) refuses non-local database URLs. A bare `npx next`, `npx prisma` or `npx playwright` still reads only `.env`, which may point at production, so the e2e config must keep injecting its own env (shell env vars beat `.env`).
- `npm test` runs about 60 Vitest files against the local `gadget_dev` loaded from `.env.dev`; the guard aborts on a non-local `DATABASE_URL`, so it is safe to run. Plain `npx vitest` is guarded too.
- Required boot env (`src/env.ts:11-18`, all `z.string().min(1)`, any dummy passes): `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. Loaded via `instrumentation.ts`.
- next-auth rewrites `/api/auth/*` origin to `NEXTAUTH_URL`, so it must be `http://localhost:3100`. `trustHost` is true outside production; `AUTH_TRUST_HOST=true` anyway. Use `localhost`, not `127.0.0.1` (Next 16 dev has no `allowedDevOrigins`).
- Seed (`prisma/seed.ts`): users `admin@tecnologia.test`/`admin12345` and `customer@tecnologia.test`/`customer12345`, both with null `emailVerified`. Login throws `UnverifiedEmailError` until set (`authOptions.ts:111`). Products: `iphone-15-pro` (SKU `APL-IP15P-256`, stock 25, 16500000 cents), `galaxy-s24-ultra` (18), `macbook-air-m3` (12), `dell-xps-15` (8). Re-seeding resets stock.
- Signup is a server action. With mailer unconfigured (`RESEND_API_KEY`, `EMAIL_FROM` blank) it returns `devCode` and the client pushes `/verify-email?email=...&devCode=NNNNNN` (`auth.service.ts:58`, `actions.ts:44-49`).
- Rate limits are Postgres-backed (`RateLimitBucket`; Redis only if `UPSTASH_*` is set, leave it unset for e2e): signup 5/15min/IP, login 10/15min/IP+email, checkout 10/60s. A per-run DB wipe resets them. `clientIp` trusts `x-forwarded-for`.
- Prisma CLI 6.17.0 `migrate deploy` calls `ensureDatabaseExists` (creates a missing DB). Inferred from minified source, not run. Role needs CREATEDB.
- Checkout (`src/modules/checkout/components/checkout-client.tsx`): COD is the default radio; all four methods render. COD orders become `CONFIRMED` immediately. Shipping is free at or above Tk 5,000. Success goes to `/orders/<cuid>`. Order number format `T-<base36>-<6 hex>` (`checkout.service.ts:23-27`).
- Order cancel (`orders/[id]/page.tsx:180-192`): no confirm dialog. Button disabled until reason has at least 2 chars. Cancel restocks (`restockOrderItems`, `cancelOrderInTx`, `cancelByCustomer` in `orders.service.ts`).
- Admin status change (`dashboard/orders/[id]/page.tsx:157-188`): six buttons labelled with the raw enum; `ALLOWED_TRANSITIONS` at `src/server/orders/orders.service.ts:99`; PATCH `/api/admin/orders/{id}`; 409 `Cannot move order from X to Y`. No native `confirm()` or `alert()` anywhere in `src`.
- Guards (`src/proxy.ts:16-50`): anon or customer to `/dashboard`, anon to `/account` redirect to `/login?callbackUrl=<percent-encoded path>`. `/api/admin/*` returns JSON 401 `{code:'UNAUTHORIZED'}` for anon and customer. `/checkout` redirects server-side to `/login?callbackUrl=/checkout` (unencoded).
- Currency: `formatBDT` (`src/server/common/money.ts:14-17`) returns `"Tk " + Intl.NumberFormat('en-BD')`. Tests mirror it with a helper, never hard-coded strings.
- Selectors: `data-testid` count in `src` is 0. Role, label and text selectors are workable, except the gaps listed under Phase 2 and Phase 4.
- Local env: Node v26.1.0 (untested with Next 16.2.4 and Prisma 6.17), Postgres listening on 5433, no `psql` or `docker` on PATH. `@prisma/client` 6.16.2 vs CLI 6.17.0 minor mismatch, left alone.

## Constraints, assumptions, risks, unknowns

**Non-negotiable**
- Never touch production. Guard: URL host in `localhost`, `127.0.0.1`, `[::1]` and DB name exactly `gadget_e2e`.
- The server must connect to the e2e DB only: `reuseExistingServer: false`.
- Only `data-testid` edits in `src/`. No logic changes.
- Secrets never printed or committed.

**Assumptions**
- Local Postgres on `localhost:5433` accepts the credentials in main's `.env.dev` for a new database.
- Chromium desktop plus mobile viewport (Pixel 7 device) is enough.

**Risks and mitigations**
- Node 26 untested: Phase 1 verifies. Fallback Node 24 (dev-env plan pins 24.x).
- `migrate reset` creating a missing DB inferred, not run: Phase 1 verifies. Fallback `prisma migrate deploy` first.
- Mobile may hide header elements: Phase 5 resolves. Fallback `/cart`-page assertions on mobile, as a comment, not a skip.
- Sonner toasts live about 2 s: assert them immediately after the action.
- Untracked `.claude/skills/*` and modified `.claude/skills/git-hygiene/SKILL.md` exist only in the main checkout and will not be in the worktree. Executor copies what it needs, uncommitted.

## Workspace setup (first step)

User chose a dedicated worktree so main checkout stays free for other work. Branch is based off `main` (already at `65bce8b`). PR target `dev` per `git-hygiene`.

1. Main checkout: `git checkout chore/dev-environment-setup`, then `git stash pop`. This frees the branch.
2. `git worktree add C:\Users\muhammad\Desktop\gadget-website-e2e feature/playwright-e2e-testing`.
3. Move this plan file into the worktree's `docs/plans/` and delete it from the main checkout (it is untracked there).
4. In the worktree: `npm ci`, `npx playwright install chromium`.
5. Create gitignored `.env.e2e` in the worktree with `E2E_DATABASE_URL=postgresql://<user>:<pass>@localhost:5433/gadget_e2e`. Copy user and pass from main's `.env.dev` without echoing them.

## Phase 1: Foundation

**Scope:** `package.json` (devDep `@playwright/test`, script `"test:e2e": "playwright test"`), `playwright.config.ts`, `e2e/support/db-guard.ts`, `e2e/support/env.ts`, `e2e/global-setup.ts`, `.gitignore` (`test-results/`, `playwright-report/`, `e2e/.auth/`, `.env.e2e`), `e2e/infra.spec.ts`, `e2e/smoke.spec.ts`.

**Steps**
1. Write the guard spec first (`tdd` skill), then the guard.
2. Config: projects `infra` (no browser) and `chromium-desktop`. baseURL `http://localhost:3100`. `workers: 1`, `retries: 0`. Reporter `[['line'], ['html', {open: 'never'}]]`. Trace `retain-on-failure`. `webServer` runs `npm run dev -- -p 3100` with `reuseExistingServer: false`. Load `.env.e2e` with `process.loadEnvFile` if present.
3. Server env: `DATABASE_URL` = e2e URL; `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` = `http://localhost:3100`; `NEXTAUTH_SECRET` = dummy; `AUTH_TRUST_HOST=true`; `CLOUDINARY_*` = dummy. Blank all of `RESEND_API_KEY`, `EMAIL_FROM`, `SSLCOMMERZ_*`, `BKASH_*`, `GOOGLE_*` (executor reads `src/env.ts` and `authOptions.ts` for exact names).
4. Global setup, in order: guard the URL; confirm `select current_database()` via a Prisma client with explicit `datasourceUrl` returns `gadget_e2e`; `prisma migrate reset --force --skip-seed`; run `prisma/seed.ts` via tsx with that env; `user.updateMany({where: {emailVerified: null}, data: {emailVerified: new Date()}})`.

**Acceptance criteria**
- [ ] `npx playwright test --project=infra` passes. `[E2E-INFRA-01]` asserts the guard accepts `postgresql://u:p@localhost:5433/gadget_e2e`, `postgresql://u:p@127.0.0.1:5433/gadget_e2e` and `postgresql://u:p@[::1]:5433/gadget_e2e`.
- [ ] `[E2E-INFRA-01]` also asserts the guard rejects: host `db.prisma.io`, db `gadget_dev`, db `gadget_e2e_x`, host `localhost.evil.com`, the string `not-a-url`, and `undefined`. Each rejection throws a message containing `refusing`.
- [ ] `E2E_DATABASE_URL=postgresql://u:p@db.prisma.io:5432/gadget_e2e npm run test:e2e` exits non-zero with `refusing` in the output, with no DB connection attempted and no server started.
- [ ] With `gadget_e2e` non-existent beforehand, `npm run test:e2e -- e2e/smoke.spec.ts` creates and migrates it. The `User` table then holds exactly 2 rows, `admin@tecnologia.test` and `customer@tecnologia.test`, both with non-null `emailVerified`.
- [ ] `[E2E-INFRA-02]` loads `/`, gets HTTP 200, sees heading "Featured products", and sees exactly 4 `a[href^="/products/"]` links inside main content (seed has 4 products).
- [ ] After a run, port 3100 is free. A second run with port 3100 occupied fails rather than attaching.
- [ ] `git status` in the worktree shows no `.env.e2e`, `test-results/`, `playwright-report/`, or `e2e/.auth/` entries.
- [ ] `next dev` and Prisma both run on Node 26. If either fails, the failure is recorded and Node 24 is used.

## Phase 2: Guest browse and cart

**Scope:** `e2e/guest-browse.spec.ts`, `e2e/guest-cart.spec.ts`, `e2e/support/format.ts` (mirrors `formatBDT` with `Intl.NumberFormat('en-BD')`). Testids: `product-price` (`src/modules/storefront/components/product-detail-purchase-panel.tsx:45`) and `cart-line-quantity` (`src/app/components/cart/cart-line-item.tsx:87`).

**Acceptance criteria**
- [ ] `[E2E-BROWSE-01]`: `/products` shows h1 "All products" and 4 product links. Clicking the card link for `iphone-15-pro` lands on `/products/iphone-15-pro`. Its h1 is non-empty and `product-price` text equals `formatBDT(16500000)`.
- [ ] `[E2E-BROWSE-02]`: `/products/does-not-exist` returns HTTP 404.
- [ ] `[E2E-CART-01]`: On `/products/iphone-15-pro`, clicking "Add to cart" shows toast "Added to cart". `localStorage['Cryptech.guestCart']` parses to `state.lines` with 1 line, quantity 1. `getByLabel('1 items in cart')` becomes visible.
- [ ] `[E2E-CART-01]`: A second click gives quantity 2 and label "2 items in cart". After `page.reload()` on `/cart`: h1 "Your cart", `cart-line-quantity` = `2`, and the link "Sign in to checkout" has href `/login?callbackUrl=/checkout`.
- [ ] `[E2E-CART-02]`: "Increase quantity for <name>" moves quantity 2 to 3. "Remove" in that line item shows "Your cart is empty." and `lines` is `[]` in localStorage.

## Phase 3: Auth and guards

**Scope:** `e2e/auth.setup.ts` (project `setup`, writes `e2e/.auth/admin.json` and `e2e/.auth/customer.json`), `e2e/auth.spec.ts`, `e2e/guards.spec.ts`. Browser projects get `dependencies: ['setup']`.

**Acceptance criteria**
- [ ] `auth.setup.ts` logs in `admin@tecnologia.test` and `customer@tecnologia.test` (seed passwords) via the `/login` form and saves storage state. It fails if the URL is not `/` after login.
- [ ] `[E2E-AUTH-01]` signup with a unique email `e2e-<timestamp>@example.test` and password `Passw0rd!e2e`: the browser lands on `/verify-email?...devCode=<6 digits>`. Entering that code and clicking "Verify email" reaches `/login`. Login shows toast "Signed in" and lands on `/`.
- [ ] `[E2E-AUTH-02]` wrong password for `customer@tecnologia.test` shows toast "Invalid email or password" and the URL stays `/login`.
- [ ] `[E2E-AUTH-03]` freshly signed-up, unverified user: login shows toast "Please verify your email before logging in." and the URL becomes `/verify-email?email=<encoded email>`.
- [ ] `[E2E-AUTH-04]` signing up with an existing email (`customer@tecnologia.test`) shows toast "An account with this email already exists".
- [ ] `[E2E-GUARD-01]` anonymous: `/account` redirects to `/login?callbackUrl=%2Faccount`. `/dashboard` redirects to `/login?callbackUrl=%2Fdashboard`. `/checkout` redirects to `/login?callbackUrl=/checkout`. `GET /api/admin/orders` returns 401 with JSON `{code:'UNAUTHORIZED'}`.
- [ ] `[E2E-GUARD-02]` customer storage state: `/dashboard` redirects to `/login?callbackUrl=%2Fdashboard`. `GET /api/admin/orders` returns 401.

## Phase 4: Orders and admin

**Scope:** `e2e/support/orders.ts` (`createCodOrder(request)` using customer storage state: create address, add the iphone variant to the cart, `POST /api/checkout`; endpoint shapes read from `docs/context/04-api-reference.md` and `src/contracts`), `e2e/support/db.ts` (read-only `variantStock(sku)` using the guarded client), `e2e/checkout.spec.ts`, `e2e/orders.spec.ts`, `e2e/admin-orders.spec.ts`. Testids: `order-status` (`src/app/(public)/orders/[id]/page.tsx:72`), `admin-order-status` (admin order detail header badge, `src/app/(dashboard)/dashboard/orders/[id]/page.tsx` near line 63), `checkout-subtotal` and `checkout-total` (`src/modules/checkout/components/checkout-client.tsx:299-313`).

**Acceptance criteria**
- [ ] `[E2E-CHECKOUT-01]` customer, UI flow: add `iphone-15-pro` from its detail page, open `/checkout`, "Add new address" with recipient `E2E <timestamp>`, city `Dhaka`, then "Add address" shows toast "Address saved". "Cash on delivery (COD)" is checked by default. "Place order" becomes enabled and `checkout-total` equals `formatBDT(16500000)` (free shipping above Tk 5,000; executor confirms the exact display). Click it.
- [ ] `[E2E-CHECKOUT-01]` after placing: URL matches `/orders/<id>`, h1 matches `/^Order T-[0-9A-Z]+-[0-9A-F]{6}$/`, `order-status` is "Confirmed", text `Payment: COD` is visible, and `variantStock('APL-IP15P-256')` dropped by exactly 1 from its value before placing.
- [ ] `[E2E-CHECKOUT-02]` customer with an empty cart opens `/checkout` and sees "Your cart is empty." and no enabled "Place order" button.
- [ ] `[E2E-ORDER-01]` order made via `createCodOrder`. At `/orders/<id>`, "Cancel order" is disabled while the reason is empty and enabled after filling "e2e test" in the placeholder "Tell us why you'd like to cancel". Click: toast "Order cancelled", `order-status` "Cancelled", the cancel card is gone, an event "Cancelled by customer: e2e test" is visible, and `variantStock` equals its value from before `createCodOrder`.
- [ ] `[E2E-ADMIN-01]` order made via `createCodOrder`, admin storage state. `/dashboard/orders`: h1 "Orders". Filling the search with the order number leaves exactly one row. Clicking its link gives h1 `Order <number>`. `admin-order-status` is "Confirmed". Buttons `PROCESSING` and `CANCELLED` are enabled; `CONFIRMED`, `SHIPPED`, `DELIVERED` and `PENDING` are disabled.
- [ ] `[E2E-ADMIN-01]` clicking `PROCESSING`: toast "Order updated", `admin-order-status` "Processing", `SHIPPED` enabled, `PROCESSING` disabled, and the Audit trail gains an entry.
- [ ] `[E2E-ADMIN-02]` from PROCESSING, `PATCH /api/admin/orders/<id>` with `{status:'DELIVERED'}` returns 409 with message "Cannot move order from PROCESSING to DELIVERED".

## Phase 5: Mobile and agent workflow docs

**Scope:** config project `chromium-mobile` (Pixel 7 device), `e2e/README.md`, `CLAUDE.md` (short testing section), spec-ID index.

**Acceptance criteria**
- [ ] `npm run test:e2e` runs every spec in both `chromium-desktop` and `chromium-mobile` and passes. Any mobile-specific workaround is a comment in the test, not a skip.
- [ ] `e2e/README.md` lists every `[E2E-*]` ID, its flow, and the CLAUDE.md or `docs/context` section it covers. A grep of `\[E2E-[A-Z]+-\d+\]` across `e2e/` yields exactly the same IDs as the README table.
- [ ] README documents: `.env.e2e` setup, `npm run test:e2e`, `npm run test:e2e -- -g "E2E-CHECKOUT"`, port 3100, and "DB is wiped each run".
- [ ] CLAUDE.md gains 3 lines or fewer: run `npm run test:e2e` (line reporter, failures only) instead of manual browser checks; cite `[E2E-*]` IDs in specs. The stale COD-only statement is left for a separate fix.

## Cross-Validation Phase (always last)

- [ ] `npm run test:e2e` passes in full, twice consecutively (the DB is wiped each run, so results are deterministic).
- [ ] `npm run typecheck` exits 0 (e2e files included or explicitly excluded, executor states which) and `npm run lint` shows no new errors versus `main`.
- [ ] Do NOT run `npm test`. Its live-DB suites would hit `.env`'s DB if present. Executor records this as skipped, with the reason.
- [ ] `git diff main -- src/` contains only added `data-testid` lines. The count of non-testid changed lines is 0.
- [ ] Every acceptance item above is ticked. One final overall code review (`code-review` skill) shows no blocking findings.
- [ ] Verify skill: temporarily rename the "Place order" button text locally, confirm the suite fails with a one-line failure, then revert.

## Out of scope

CI or GitHub Actions gate; Firefox and WebKit; bKash, SSLCommerz and bank-transfer payment paths; admin product CRUD and Cloudinary; coupons; reviews; warranty; forgot and reset password; Google OAuth; visual regression and a11y checks; integrating with the dev-env plan; production build mode; fixing the `npm test` live-DB hazard; fixing stale CLAUDE.md payment text.

**Shortcuts taken** (execution turns each into a `shortcut: <limit>, <when to upgrade>` code comment)
- `shortcut: next dev server, upgrade to build+start if compile time makes tests flaky.`
- `shortcut: retries 0, upgrade only if a root-caused flake cannot be fixed.`
- `shortcut: seed constants (slugs, SKU, credentials) hard-coded in e2e/support, upgrade by exporting from prisma/seed.ts when it is next touched.`
- `shortcut: testids ship in the production DOM, upgrade by stripping them in prod builds if it ever matters.`

## Rollback

`git worktree remove --force C:\Users\muhammad\Desktop\gadget-website-e2e`, `git branch -D feature/playwright-e2e-testing` (nothing pushed, equals `main`), drop DB `gadget_e2e`. The main checkout is already restored by Workspace setup step 1.
