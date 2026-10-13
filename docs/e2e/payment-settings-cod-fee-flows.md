# E2E flows: payment settings and COD confirmation fee

Source: the browser regression runs done with Chrome DevTools MCP agents on branch `feature/admin-payment-methods-cod-fee` (three runs: the feature itself, the structural-cleanup regression, and a targeted run for the follow-up phases). This file turns what those runs actually did into test cases you can implement with Playwright. Nothing here is implemented yet: the repo has no Playwright dependency, config or tests.

All three runs finished with no failures. The latest targeted run covered the cases marked "recent change" below, except the ones listed under "Could not verify in the manual runs" at the end. Treat every case as a case to implement, not as a recorded pass: the runs were done by an agent clicking through the app, and their notes (strings, request counts, observed quirks) are what this file records.

Setup, project layout and the core smoke flows live in [the Playwright plan](../plans/playwright-e2e-testing-plan.md); this file adds the payment-settings and COD-fee cases on top of it.

## Why Playwright instead of the MCP agent runs

- An MCP agent spends tokens on every click and snapshot and is not repeatable. A Playwright suite costs nothing per run, is deterministic and runs in CI.
- Keep the MCP/agent browser only for one-off exploration of something new. Use Playwright for regression of the flows below.
- Cost of the switch: someone has to write and maintain the selectors and fixtures once (this doc is the spec for that).

## Suggested setup (not implemented)

- Dev dependency `@playwright/test`; `playwright.config.ts` at the repo root; tests in `e2e/`. Chromium only is enough.
- **One worker, serial** (`workers: 1`, `fullyParallel: false`). The suite mutates the `PaymentSettings` singleton, products' stock, the `RateLimitBucket` table and creates orders in a shared DB. Same reason `vitest.config.ts` has a `settings-serial` project.
- **Local DB only.** The vitest global setup (`vitest.global-setup.ts`) aborts on a non-local `DATABASE_URL`; copy that guard into the Playwright `globalSetup`. Local DB is `localhost:5433/gadget_dev`; credentials are in the gitignored `.env.dev`, which is NOT auto-loaded (load it in the `webServer` command and in the test process). Never point it at the remote DB in `.env`.
- **webServer:** prefer a production build (`next build && next start`) for any test that counts network requests. `next dev` runs React Strict Mode, which doubles effects and so doubles requests; asserting "exactly one request" is only valid on a production build. For everything else `npm run dev` is fine. Blank the mailer so no email is sent: `RESEND_API_KEY=` and `EMAIL_FROM=` in the server env. Stop any `next dev` already running on :3000 first (one dev server per directory).
- **Auth:** log in once per role in `globalSetup` and save `storageState` files (`admin.json`, `customer.json`, `customer2.json`). Use separate browser contexts when one test needs admin and customer at once.
- **DB helper:** a small module using the repo's Prisma client for fixtures and assertions (settings presets, reset, reading `Payment`/`Order`/`OrderEvent`). Use the API for anything the UI can do, and the DB only for setup and for asserting stored values.
- **Seed gotchas:** `npm run db:seed` creates `admin@tecnologia.test` / `admin12345` and `customer@tecnologia.test` / `customer12345`, but leaves `emailVerified` null, so login redirects to `/verify-email`. Mark them verified in `globalSetup`. A second customer is needed for the duplicate-txn case: create one by DB insert (verified).
- **No QR upload in tests.** Uploading goes to the real Cloudinary dev folder and an unsaved removal leaves an orphan. Skip QR cases, or stub the upload route.
- **Reset between tests** (a `beforeEach`/fixture): restore the `PaymentSettings` row to a known preset, `DELETE FROM "RateLimitBucket"` (rate limits last 10 minutes and persist in the DB), clear the customer's cart. Created orders can stay; give each test its own txn ids (uppercase alphanumeric, 6 to 30 chars) so they never collide.
- Add `data-testid`s only where role/text selectors are not stable. The page text below is what the runs relied on.

## Test data

- Users above. Shipping: Dhaka addresses pay Tk 60, others Tk 120, free at Tk 5000 and above (`src/server/checkout/shipping.ts`). Money is integer cents everywhere (`49840` = Tk 498.40).
- Products from the seed: `APL-IP15P-256` (iPhone 15 Pro), `SMS-GS24U-512`, `APL-MBA-M3-512`, `DEL-XPS15-32`. Read prices from the DB; do not hard-code them.
- **Exact Tk 498.40 order total** (used for the PERCENT 25 case: fee Tk 124.60 rounds up to Tk 130): create a test product priced `43840` cents and use a Dhaka address, so subtotal 438.40 + shipping 60 = 498.40 with no coupon. (The manual runs got the same total with a FIXED coupon; a purpose-built product is simpler.)
- The customer needs one saved address and a cart item before `/checkout`. Seed or create these in the fixture.

### Settings presets (apply via DB helper or `PUT /api/admin/settings/payments`)

The admin settings body is `{ enabledMethods: PaymentMethod[], codFeeEnabled, codFeeType, codFeeValue, qrImageUrl, qrImagePublicId, contactNumber, paymentNote }`. `enabledMethods` values: `COD`, `SSLCOMMERZ`, `BKASH`, `BANK_TRANSFER`. `codFeeValue` is cents for FLAT (`10000` = Tk 100, multiple of 100, at least 100) and an integer 1 to 100 for PERCENT. Gateways (`BKASH`, `SSLCOMMERZ`) cannot be enabled without credentials; the dev env has none.

| Preset | enabledMethods | Fee |
| --- | --- | --- |
| `cod-only` (default) | COD | off |
| `cod-bank` | COD, BANK_TRANSFER | off |
| `bank-only` | BANK_TRANSFER | off |
| `flat100` | COD, BANK_TRANSFER | FLAT `10000`, contact `01800000000`, note any text |
| `pct25` | COD, BANK_TRANSFER | PERCENT `25`, contact `01800000000` |

Contact numbers must match `^(\+?88)?01[3-9]\d{8}$`.

## Test cases

Legend: **[UI]** needs the browser; **[API]** use Playwright's `request` fixture only (no page); **[DB]** assert in the DB; priority P0 (must), P1, P2. Notes marked "recent change" were touched by the latest refactor and should be covered first.

### A. Admin payment settings (`/dashboard/settings`), admin session

- **A1 [UI] P0 load + save persistence.** Open the page: shown values equal the DB row. Toggle Bank Transfer on, set FLAT fee 100, contact `01800000000`, a note; Save. Toast "Payment settings saved"; reload shows the same values; [DB] `enabledMethods` equals `{COD, BANK_TRANSFER}` in that canonical order (`COD, SSLCOMMERZ, BKASH, BANK_TRANSFER`), `codFeeValue = 10000`. (recent change: array model)
- **A2 [UI] P0 gateways locked.** bKash and SSLCommerz switches are disabled and carry the badge "credentials missing".
- **A3 [UI] P0 save disabled until dirty.** Save and Discard are disabled on load and after save, enabled after an edit; Discard restores the saved values.
- **A4 [UI] P0 COD off turns fee off.** With the fee on, switch COD off: the fee switch turns off/disabled.
- **A5 [UI] P0 no method blocks save.** Switch every available method off: inline error "No payment method enabled / Turn on at least one available method, otherwise customers cannot check out." and Save is disabled.
- **A6 [UI] P1 fee preview.** Choose PERCENT 25 and set the sample total to `498.40`: text reads "On an order of Tk 498.4 → fee Tk 130, due on delivery Tk 368.4". For FLAT 100: "fee Tk 100, due on delivery Tk 398.4". Typing in the sample and fee inputs must not jump the cursor (type `498.40`, then edit). (recent change: form split)
- **A7 [API] P0 shape + validation.**
  - `GET /api/admin/settings/payments` as admin: 200, `settings.enabledMethods` is an array (no `codEnabled` etc.), `gatewayConfigured` has exactly four keys `COD, SSLCOMMERZ, BKASH, BANK_TRANSFER` with booleans only (no env values anywhere in the body). No session: 401. Customer session: 403.
  - `PUT` with `enabledMethods: []`: 400 "At least one payment method must remain enabled".
  - `PUT` with duplicates and reversed order (`['BANK_TRANSFER','COD','COD']`): 200 and stored as `['COD','BANK_TRANSFER']`.
  - `PUT` PERCENT value `0` or `101`: 422 `VALIDATION_ERROR`. `codFeeEnabled: true` without COD in `enabledMethods`: 422. Enabling BKASH without credentials: 400 with a message containing "credentials". Old-shape body with the four booleans: 422.

### B. Customer checkout method list and config (`/checkout`), customer session

Precondition: cart has an item, a saved Dhaka address exists.

- **B1 [UI] P0 list follows settings.** `cod-bank`: exactly two payment radios, COD checked. `bank-only`: one radio, Bank Transfer, preselected, Place Order enabled.
- **B2 [UI] P0 config failure.** Make `GET /api/checkout/config` fail (route fulfil 503 via `page.route`): alert "We could not load the payment methods." with a Retry button, zero payment radios, Place Order disabled, no hard-coded methods. (React Query retries a failed config once automatically, so expect two failed config requests before the alert settles; do not assert exactly one.) Remove the route override and click Retry: radios return and Place Order enables. (recent change: shared error component)
- **B3 [UI] P0 method disabled mid-checkout.** Load checkout under `cod-bank`, keep it open, switch the DB preset to `bank-only`, place an order with COD selected: `POST /api/checkout` is 400 with body `{"code":"BAD_REQUEST","message":"That payment method is no longer available","meta":{"reason":"payment_method_unavailable","method":"COD"}}`, a toast with the same text, the config is refetched and the list drops COD; [DB] no new order, cart item still present, stock unchanged.
- **B4 [API] P0 gateway guard.** `POST /api/checkout` with `paymentMethod: "BKASH"` (and `"SSLCOMMERZ"`) while not enabled: 400 with the same body and `method` set; [DB] no order created. `POST /api/checkout/quote` with `BKASH`: 400.
- **B5 [UI] P1 config is fetched once.** On a production build, loading checkout makes exactly one `GET /api/checkout/config`. Switching tabs/window focus does not refetch it or the quote. (recent change: `staleTime` 30 s, no focus refetch)

### C. Checkout quote requests and totals (recent change: quote is now a keyed query)

Use a production build and count requests with `page.on('request')`.

- **C1 [UI] P0 one quote per action.** Initial load: exactly one `POST /api/checkout/quote`. Changing payment method: exactly one. Applying a valid coupon: exactly one. Changing address (if the customer has two): exactly one.
- **C2 [UI] P0 invalid coupon.** Apply a bad code: error toast, the coupon is cleared, then exactly one follow-up quote without the coupon.
- **C3 [UI] P1 no stale totals while loading.** After a method/coupon change, until the new quote returns, the shipping and total fields show `...` (not the previous numbers), the subtotal stays, and Place Order is disabled; after the quote arrives it enables. Delay the quote response with `page.route` to observe it. (The Discount row showed "- Tk 0" while loading in the manual run; a follow-up fix changes it to `...` while a coupon quote is loading. Assert `...` once that fix is in.)
- **C4 [UI] P0 request body.** Quote body contains `addressId`, and `paymentMethod` once config has loaded; `couponCode` only when a coupon is applied (keys omitted when null).
- **C5 [UI] P0 quote error 409/stock.** A stock conflict response on quote toasts, invalidates the cart, and clears the coupon (route-fulfil a 409 to test).

### D. Fee flows at checkout, customer session

- **D1 [UI] P0 fee off.** Preset `cod-only`: no fee notice and no fee rows. Place a COD order: redirected to `/orders/<id>`, status Confirmed; timeline order is `Order placed`, then `COD order auto-confirmed; awaiting fulfilment`; [DB] `Payment.feeStatus = NONE`, `feeCents = 0`.
- **D2 [UI] P0 FLAT fee.** Preset `flat100`, COD selected: notice text exactly "This order requires a confirmation fee (flat Tk 100) to be confirmed. Pay or contact admin at 01800000000."; the summary shows "Confirmation fee (advance)  Tk 100" and "Due on delivery" = total minus Tk 100; the Total row is unchanged. Switching to Bank Transfer hides the notice and rows; the re-quote body has `paymentMethod: "BANK_TRANSFER"` and the response has `codFeeCents: 0`, `codFeeRule: null`. Placing the COD order: order is Pending, timeline `Order placed`, `COD confirmation fee pending` in that order; [DB] `feeStatus = PENDING`, `feeCents = 10000`, `feeType = FLAT`, `feeValue = 10000`, `amountCents = totalCents`.
- **D3 [UI] P0 PERCENT fee rounding.** Preset `pct25` and the Tk 498.40 order: notice contains "(25% = Tk 130)", fee row Tk 130, due on delivery Tk 368.4; [DB] `feeCents = 13000`, `feeType = PERCENT`, `feeValue = 25`.
- **D4 [UI] P0 txn id field.** With the fee on: typing 8 characters sends no request; blur sends exactly one `POST /api/payments/txn-check` with the id uppercased in the body; an empty field sends none. Use an id that already exists on another payment: message "Transaction ID already exists. You can place the order without a transaction ID and contact admin.", no link and no order number/id anywhere in the DOM, and the `POST /api/checkout` body has no `customerTxnId`. A new id typed in lowercase is stored uppercased ([DB] `customerTxnId`).
- **D5 [API] P0 server duplicate.** `POST /api/checkout` with COD and a `customerTxnId` that already exists: 409 `{"code":"TXN_ID_DUPLICATE","message":"Transaction ID already exists"}`; [DB] no order created, cart and stock unchanged.
- **D6 [DB+API] P1 concurrent same txn id.** Two customers call `POST /api/checkout` at the same time with the same new txn id: exactly one 2xx and one 409 `TXN_ID_DUPLICATE`; the loser's cart is intact and stock fell by one unit only. (Covered by a vitest race test; add here only if you want it end to end.)
- **D7 [UI] P1 fee row layout at 375 px.** Viewport 375x812: no horizontal scroll on `/checkout` (`document.documentElement.scrollWidth <= window.innerWidth`).

### E. Customer order page (`/orders/<id>`), customer session

Use orders created through the flows above (or DB-created with the right `feeStatus`).

- **E1 [UI] P0 fee-pending order.** Shows "Confirmation fee required", "Admin contact: 01800000000", the payment note, and the add-transaction-id card ("Paid the confirmation fee? ... You can add it once."). Status badge Pending.
- **E2 [UI] P0 add txn id.** Enter an id and click Add: dialog contains "Are you sure the transaction ID is correct? It cannot be edited after submission. If it is wrong, contact admin at 01800000000. Your order and confirmation fee are safe." Cancel sends no request. Confirm sends exactly one `POST /api/payments/txn-id`; the id then shows read-only with "Submitted ...", the page has no editable txn input anywhere, and it persists after reload; [DB] `customerTxnId` set, `txnSubmittedAt` set.
- **E3 [UI] P0 duplicate on order page.** Submit an id used elsewhere: response 409 `TXN_ID_DUPLICATE`; message "Transaction ID already exists. Please contact admin at 01800000000." with no link and no other order number; nothing saved.
- **E4 [UI] P0 other states.** `REJECTED`: alert "Your confirmation fee could not be verified. Contact admin at 01800000000.", no form; summary shows Due on delivery = full total. `VERIFIED`: "Confirmation fee verified", no form. `WAIVED`: no alert, no form and NO fee summary rows (Subtotal, Discount, Shipping, Total only). Cancelled or not-Pending order: no form. (recent change: shared view)
- **E5 [UI] P1 snapshot survives settings change.** Place a PERCENT 25 order, then switch the preset to `cod-only` (fee off) and reload the order: the warning and add-txn form still show (from the payment snapshot).
- **E6 [UI] P1 config failure on the order page.** Fail `GET /api/checkout/config`: alert "We could not load the payment details for your confirmation fee." with Retry; Retry restores the notice. (recent change)
- **E7 [UI] P0 cancel card.** On a Pending (or Confirmed/Processing) order, type a reason of at least 2 characters (button disabled before that), click "Cancel order": toast "Order cancelled", status Cancelled, the cancel card disappears; [DB] order CANCELLED and stock restored. (recent change: extracted card)
- **E8 [UI] P2 warranty card.** Only on DELIVERED orders: submit a request, toast "Warranty request submitted". Needs a DELIVERED order (admin transitions PENDING to CONFIRMED to PROCESSING to SHIPPED to DELIVERED, or a DB fixture). (recent change)
- **E9 [UI] P2 render correctness.** Items, shipping address, totals (Subtotal - Discount + Shipping = Total) and the event timeline match the DB order. At 375 px no horizontal scroll.

### F. Admin order detail (`/dashboard/orders/<id>`), admin session

- **F1 [UI] P0 fee panel.** For a fee-pending order: badge PENDING, rule text ("flat Tk 100" or "25% = Tk 130"), fee, due on delivery, customer transaction id (or an em dash), and the edit-txn control.
- **F2 [UI] P0 verify.** Click "Fee received — confirm order", confirm in the dialog: toast "Fee verified, order confirmed"; order Confirmed, badge VERIFIED; timeline adds "COD confirmation fee verified by admin"; [DB] `feeVerifiedById` set.
- **F3 [UI] P0 reject then verify.** "Reject fee" opens a dialog with an optional note and text saying the note is visible to the customer. After rejecting: toast "Confirmation fee rejected", badge REJECTED, order still Pending, timeline "COD confirmation fee rejected by admin: <note>", "Reject fee" no longer offered but "Fee received — confirm order" still is. Verifying then works: order Confirmed, timeline "COD confirmation fee verified by admin after an earlier rejection". (recent change: extracted dialogs)
- **F4 [UI] P0 txn id dialog.** Open "Add / edit transaction ID": an invalid format (too short, symbols) shows a validation message; a duplicate id shows a modal "Transaction ID already used ... on order #<existing number>. It was not saved on this order." with an "Open order" link (`target=_blank`, href `/dashboard/orders/<existingOrderId>`) that returns 200; the value on the current order stays unchanged; a valid unique id saves and shows. (recent change)
- **F5 [UI] P0 waive.** Press the order status button Pending to Confirmed on a fee-pending order: dialog "Confirmation fee not verified. Confirming will waive it. The order will be confirmed and the fee marked as waived." with button "Confirm and waive fee". Result: order Confirmed, fee badge WAIVED, timeline "Confirmed without confirmation fee (waived by admin)". The Summary card on the admin page shows NO "Confirmation fee (advance)" / "Due on delivery" rows for a WAIVED fee. The fee panel above it still shows the WAIVED badge and still lists its Rule, Fee and Due on delivery lines; do not assert those are hidden. (recent change)
- **F6 [UI] P1 REJECTED summary.** For a REJECTED fee the Summary shows Due on delivery equal to the full order total.
- **F7 [UI+DB] P1 cancel restores stock.** Cancel a Pending order (including a REJECTED-fee one) from the admin page: status Cancelled; [DB] product stock restored by the ordered quantity.

### G. Admin payments page (`/dashboard/payments`), admin session

- **G1 [UI] P0 columns.** Header cells include Order, Customer, Method, Reference, Txn ID, Amount, Fee, Fee status, Created, Action.
- **G2 [UI] P0 buttons per row type.** Fee-pending COD row: "Verify fee" and "Reject fee" only (no plain Verify). REJECTED fee row: only "Verify fee". Plain COD (no fee) and Bank Transfer rows: "Verify" and "Reject". Cancelled orders are absent from the list. (recent change)
- **G3 [UI] P0 confirm dialogs.** Every one of these actions opens a confirm dialog first. Fee verify: "Verify the confirmation fee?" / "The fee for order <number> will be marked verified and the order confirmed." Fee reject: "Reject the confirmation fee?" / "... rejected. The order stays pending and the customer is told the fee could not be verified. You can still verify it later if it arrives." Plain rows: "Verify this payment?" / "Order <number> will be marked as paid and confirmed." Cancelling the dialog sends nothing. (The payments-page reject has no note field; only the order-detail reject dialog collects a customer-visible note.)
- **G4 [UI] P1 refresh without reload.** On the order detail page perform "Fee received — confirm order" for a COD fee order. The mutation fires `POST /api/admin/payments/<id>/fee` and then `GET /api/admin/orders/<id>`; the detail updates in place (Confirmed, VERIFIED). The orders list and the payments page refetch when you navigate to them (`GET /api/admin/orders`, `GET /api/admin/payments`) and show the new state. Note: a COD payment stays PENDING (cash is collected on delivery), so its row does NOT leave `/dashboard/payments`; it stays with fee status VERIFIED and the buttons change from "Verify fee / Reject fee" to plain "Verify / Reject". Only a payment that really becomes SUCCEEDED (see G5) disappears from the list. (recent change: narrower invalidation)
- **G5 [UI+DB] P0 cash verify.** On a pending Bank Transfer (or plain no-fee COD) payment click "Verify" (dialog "Verify this payment? / Order <number> will be marked as paid and confirmed.") and confirm: toast "Payment verified", `POST /api/admin/payments/<id>/verify` with `{"outcome":"SUCCEEDED"}`, the payments list refetches and the row disappears; [DB] payment SUCCEEDED, order CONFIRMED with exactly one CONFIRMED timeline event ("Payment verified by admin (BANK_TRANSFER)"). A second attempt (stale button, second tab) returns 409 "Payment already processed" or "Order is no longer pending". (recent change: server compare-and-set)

### H. Customer API privacy and limits

- **H1 [API] P0 payment fields.** `GET /api/orders/<id>` as the owner: `payments[n]` keys are exactly `id, orderId, method, status, amountCents, feeCents, feeType, feeValue, feeStatus, customerTxnId, txnSubmittedAt, createdAt, updatedAt`. Absent: `rawPayload, bankRef, providerRef, verifiedById, verifiedAt, feeVerifiedById, feeVerifiedAt`. `GET /api/orders` (list) contains none of those strings either. Another user's order id gives an error and no data.
- **H2 [API] P0 txn-check.** `POST /api/payments/txn-check` with `{ "txnId": "..." }`: no session 401; known id `{"exists":true}`, unknown `{"exists":false}`, case and surrounding spaces normalized; the body has no other keys. A duplicate must never expose an order id or number to customers.
- **H3 [API] P0 rate limit.** From a clean `RateLimitBucket`: calls 1 to 10 on `txn-check` return 200, the 11th returns 429 with a `Retry-After` header and body `{"code":"RATE_LIMITED","message":"Too many requests; please try again later."}`. (There is also a per-user bucket of 30 per 10 minutes keyed without IP, so the IP-rotation case cannot be tested from one test client.) Run this LAST in a file or reset the bucket afterwards.
- **H4 [API] P0 txn submit rules.** `POST /api/payments/txn-id`: a second submission on the same payment is 409 "already submitted"; a payment owned by another user is 404; an order that is not Pending or a payment with `feeStatus` NONE is 409.

### I. Admin order and fee API (no browser)

- **I1 [API] P0 auth.** Every `/api/admin/**` route used above returns 401 without a session and 403 for a customer.
- **I2 [API] P1 fee verify/reject rules.** `POST /api/admin/payments/<id>/fee` with `{ "outcome": "VERIFIED" }` on a fee-PENDING or REJECTED payment confirms the order; `REJECTED` works only from PENDING; a second call returns 409; on a CANCELLED order 409.
- **I3 [API] P1 admin txn id.** `POST /api/admin/payments/<id>/txn-id` with an existing id returns 409 with `meta.existingOrderId` and `meta.existingOrderNumber` (admin-only; customers never get this).

## Exact strings the runs relied on

Fee notice: `This order requires a confirmation fee (flat Tk 100) to be confirmed. Pay or contact admin at 01800000000.` and `... (25% = Tk 130) ...`. Money prints without decimals (`Tk 100`, not `Tk 100.00`; `Tk 498.4`, `Tk 165,000`).
Rows: `Confirmation fee (advance)`, `Due on delivery`. Toasts: `Payment settings saved`, `Fee verified, order confirmed`, `Confirmation fee rejected`, `Order cancelled`, `Warranty request submitted`, `Transaction ID submitted` (customer order page), `Transaction ID saved` (admin dialog), `Payment verified` (payments page), `Coupon code is invalid` (checkout), `That payment method is no longer available`.
Admin txn id dialog validation (zod message shown as-is): for `ab!` it reads "Too small: expected string to have >=6 characters"; no request is sent. Customer cancel timeline entry: `Cancelled by customer: <reason>` (the reason button stays disabled until the reason has at least 2 characters).
Timeline notes: `COD order auto-confirmed; awaiting fulfilment`, `COD confirmation fee pending`, `COD confirmation fee verified by admin`, `COD confirmation fee verified by admin after an earlier rejection`, `COD confirmation fee rejected by admin: <note>`, `Confirmed without confirmation fee (waived by admin)`.

## Gotchas learned from the runs

- Strict Mode in `next dev` doubles effects; request-count assertions belong on a production build.
- `OrderEvent` ordering: events written in one transaction are given increasing `createdAt` values; if you assert timeline order, assert the visible order, not timestamps.
- The Tk 498.40 total depends on the Dhaka shipping rule; a non-Dhaka address changes it.
- Settings, stock, rate-limit rows and orders persist across tests: reset in fixtures, and give each test unique txn ids.
- Admin and customer need separate contexts; the JWT session carries `role`, so log in fresh after any role change.
- Do not test gateway (bKash/SSLCommerz) payment flows: they are off for launch and have no credentials locally. The sandbox callback routes exist but are covered by vitest.
- QR upload is intentionally excluded (real Cloudinary side effects).

## Could not verify in the manual runs (cover these in Playwright)

- Quote request after an address change (the seeded customer has one address; create a second in the fixture).
- Real tab switch for focus/blur (the run dispatched synthetic `visibilitychange`/`blur`/`focus` events; use a second page and `bringToFront()` in Playwright).
- The customer orders list refetching after a cancel (only the final list state was seen).
- The admin orders list refreshing while mounted after a fee action done on another page.
- Gateway payments and QR upload (excluded on purpose).

## Quirks seen that are not test failures

- After an invalid coupon the coupon text box still shows the typed code even though the applied coupon is cleared (unchanged from before the refactor).
- A network 4xx you provoke on purpose (empty `enabledMethods` PUT 400, missing field 422, invalid coupon, duplicate txn 409, disabled method 400) is expected; fail the test only on unexpected ones and on console errors from app code.
- If you wrap `window.fetch` in a test to count requests, keep it transparent for Next's RSC prefetch requests; a naive wrapper broke in-app navigation in one run ("Failed to fetch RSC payload"). Prefer `page.on('request')`.

## Not covered here (kept in vitest)

Concurrency and lock-order races (verify vs cancel, double callbacks, concurrent txn ids), migrations, the sandbox-trust credential logic, error-code mapping, and pure fee math. Those are already covered by the 499-test vitest suite against the local DB; do not duplicate them in Playwright.
