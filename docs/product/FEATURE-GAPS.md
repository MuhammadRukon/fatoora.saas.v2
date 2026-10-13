# Feature Gap Analysis

What the shop still needs to be *functional as a real business*, based on what actually exists in the code (2026-07-11, re-verified 2026-10-13). Grouped by audience, ordered by necessity. Free-tier constraint respected throughout.

## What already works (don't rebuild)

Customers: browse/search/filter/paginate catalog, guest + logged-in cart with merge, addresses, full checkout with quote, COD/bKash/SSLCommerz/bank-transfer, coupons, order history + tracking timeline, self-cancellation, verified-purchase reviews, warranty claims, Google OAuth, password reset and email verification (emailed via Resend).
Admins: products (with variants/images/SEO fields), categories (tree), brands, coupons, order management + audit trail, manual payment verification, warranty workflow, user management, 30-day analytics with low-stock card.

---

## P0 — Blockers for running a real shop

| Feature | Why it's a blocker | Notes |
| --- | --- | --- |
| ~~**Transactional email**~~ (✅ completed — reset, order confirmation, payment result, status emails; warranty emails still pending) | Password reset literally doesn't work in production (link only shown in dev). No order confirmation — customers of an online shop expect at minimum a confirmation email. | One `mailer.ts` + Resend/Brevo free tier. Wire: reset link, order confirmation, order status change, warranty updates. Unblocks half of this table. |
| ~~**Trust/legal pages**~~ (✅ completed — `/about`, `/privacy-policy`, `/terms`, `/refund-policy`; owner should review copy before gateway submission) | Footer links to About, Privacy Policy, Terms, Refund/Return Policy all point to `/`. SSLCommerz/bKash merchant approval typically *requires* published refund & privacy policies. Customers won't pay without them either. | Static pages; a day of work. Also an SEO/trust signal. |
| ~~**Contact channel**~~ (✅ completed — `/contact`) | No contact page, phone, or support email anywhere. COD + warranty business needs one. | Static page + optional form → email. |
| ~~**Fix payment forgery + amount check**~~ (✅ completed — forgery fixed; amount mismatch now rejects + restocks) | Not a "feature" but the shop could not safely take online payments until the callback forgery and amount checks were fixed. | Listed here so it's not deprioritized as a mere refactor. |

## P1 — Needed soon for day-to-day operation

**For customers**
- **Quantity selector on product page** — add-to-cart is hardcoded to qty 1; buying 2 chargers means editing the cart afterwards.
- **Stock visibility on PDP** — only an in/out-of-stock badge; show "only N left" under a threshold (data already exists: `stock`, `lowStockThreshold`).
- **Account profile page** — password change exists (`/account/settings`); there is still no way to change name or phone after signup.
- **Order status email/SMS** — (⚠️ email part completed via the mailer; SMS still open) covered by the email layer above; SMS (e.g. BulkSMS BD providers) matters in the BD market where email open rates are low.
- **Related products on PDP** — same category/brand query; big conversion lever, cheap to build server-side.

**For admins**
- ~~**Order state machine + restock policy**~~ (✅ completed) — operationally this is what prevents accidental DELIVERED → PENDING chaos.
- **Quick stock adjustment** — editing stock requires opening the full product form; a simple inline stock editor on the products table saves daily pain.
- **Server-side pagination for orders/products lists** — usability degrades quickly past a few hundred rows (see [KNOWN-ISSUES](../KNOWN-ISSUES.md#architecture)).
- **Refund/return workflow** — `PaymentStatus.REFUNDED` exists but is unreachable; even a manual "mark refunded + note + optional restock" beats nothing. Return policy page (P0) implies you need this.
- **Shipping/tracking fields** — SHIPPED is a bare status flip; add courier name + tracking number to the order (one migration, two form fields) so customers can self-serve "where is my order".

## P2 — Growth features (after P0/P1)

**Customers**: wishlist; product comparison (spec-table data already exists in variant `attributes` JSON); recently-viewed; back-in-stock notification (needs email layer); review photos; Q&A on PDP; better empty/error states.

**Admins**: sales reports with date-range + CSV export; review moderation UI (Review model exists, no admin surface); audit log beyond orders (products/coupons/users/warranty — see [KNOWN-ISSUES](../KNOWN-ISSUES.md#correctness)); bulk operations on tables; low-stock email digest (needs email + cron); coupon analytics (redemptions per code); banner/hero CMS (home banner is a hardcoded asset); store settings beyond payments (the payment-methods settings page exists; shipping fees and bank details are still hardcoded in `shipping.ts` and the bank-transfer page).

## P3 — Later / nice-to-have

Multi-language (Bangla) & currency display, SMS OTP login, delivery-zone rate tables, courier API integration (Pathao/RedX/Steadfast), inventory ledger with movement history, staff roles/permissions, abandoned-cart recovery emails, PWA/offline, live chat.

---

## Suggested build order (dependency-aware)

1. ~~Email layer (`mailer.ts` + Resend) → makes password reset production-real; order confirmation email.~~ (✅ completed)
2. ~~Static pages: About, Contact, Privacy, Terms, Refund policy (+ footer links).~~ (✅ completed)
3. ~~Payment security fixes (callback forgery, amount check) — before enabling live gateway credentials.~~ (✅ completed)
4. PDP quantity selector + stock hint + related products.
5. Order state machine + tracking number + status-change emails. (⚠️ state machine + status emails completed; tracking-number fields still open)
6. Account profile page. (⚠️ password change completed; name/phone editing still open)
7. Admin: quick stock edit, server pagination, refund marking.
