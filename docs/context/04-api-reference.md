# API Reference

All routes live under `src/app/api/**`. Auth levels: **public**, **user** (`requireSession`), **admin** (`requireAdminSession`). Bodies/queries are validated with Zod contracts from `src/contracts/**`. Rate-limited routes return 429 + `Retry-After` (policy per route in [02-architecture.md](./02-architecture.md#rate-limiting--logging)). Listing pages (`/products`, `/category/*`, `/brand/*`) and their `/live/*` twins are pages, not API routes; see [Caching / ISR](./02-architecture.md#caching--isr).

## Auth

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | public | Auth.js handlers |
| `/api/auth/signup` | POST | public | rate-limited; bcrypt hash |
| `/api/auth/forgot` | POST | public | rate-limited; no email enumeration; reset link is emailed; outside production the response also carries `devResetUrl` |
| `/api/auth/reset` | POST | public | rate-limited; single-use hashed token |

Email verification (verify code, resend) runs as server actions in `src/modules/auth/actions.ts`, not as routes; both are rate-limited.

## Catalog (public)

All four routes send `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/catalog/products` | GET | list published products; q/category/brand/price/stock/sort/page params; `q` requests are IP-rate-limited (120/min) |
| `/api/catalog/products/[slug]` | GET | product detail |
| `/api/catalog/categories` | GET | published categories |
| `/api/catalog/brands` | GET | published brands |

## Cart

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/cart` | GET/POST/PUT/DELETE | user | GET cart (`?view=summary` returns only `{ subtotalCents, itemCount, hasIssues }`), add item, merge guest cart (PUT), clear. PUT returns the `CartSnapshot` fields (`lines`, `subtotalCents`, `itemCount`) plus an additive `adjustments` array (`{ variantId, name?, requested, applied }`; `applied` 0 = removed because inactive or out of stock, below `requested` = clamped to stock; schema `mergeAdjustmentSchema` in `src/contracts/cart.ts`) |
| `/api/cart/[itemId]` | PATCH/DELETE | user | update qty / remove line |
| `/api/cart/hydrate` | POST | **public** | enrich guest-cart variant ids for display; no persistence; IP-rate-limited (120/min), max 50 lines |

## Checkout & orders

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/checkout/config` | GET | user | enabled payment methods, COD fee rule (type/value), QR/contact/note (all nullable); `force-dynamic`, `Cache-Control: no-store` |
| `/api/checkout/quote` | POST | user | rate-limited (30/min/user); accepts optional `paymentMethod`; returns totals + shipping + coupon validation + `codFeeCents`, `dueOnDeliveryCents`, `codFeeRule` |
| `/api/checkout` | POST | user | rate-limited; transactional order placement, accepts optional `customerTxnId`; returns `feeRequired` flag |
| `/api/orders` | GET | user | my orders |
| `/api/orders/[id]` | GET/POST | user | detail; `?action=cancel` self-cancel (restocks) |
| `/api/orders/[id]/warranty` | POST | user | rate-limited (5/h/user); file warranty claim (DELIVERED only) |

## Payments

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/payments/bank` | POST | user | submit bank transfer reference |
| `/api/payments/txn-check` | POST | user | rate-limited; check if COD txn ID exists; boolean response only (privacy) |
| `/api/payments/txn-id` | POST | user | rate-limited; customer submits COD txn ID for fee-pending order; add-only |
| `/api/payments/bkash/{success,fail,cancel}` | GET/POST | **public** | gateway callbacks → `_handlers.ts` |
| `/api/payments/sslcommerz/{success,fail,cancel,ipn}` | POST | **public** | gateway callbacks → `_handlers.ts` |
| `/api/payments/sandbox/{bkash,sslcommerz}` | GET | **public** | local sandbox harness pages; only reachable as a fallback when gateway credentials are absent |

## Reviews & warranty (customer)

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/reviews` | GET/POST | GET public / POST user | GET: up to 50 newest reviews for `productId` (`items` only; the PDP renders the summary and the first 10 itself), `Cache-Control: public, s-maxage=10`, author names "First L."; POST: rate-limited (10/h/user), create (delivered items only), then purges the PDP via `revalidateProductPage` |
| `/api/reviews/reviewable` | GET | user | delivered items eligible for review |
| `/api/warranty` | GET | user | my warranty requests |

## Account

| Route | Methods | Auth |
| --- | --- | --- |
| `/api/addresses` | GET/POST | user |
| `/api/addresses/[id]` | PATCH/DELETE | user |

## Admin (all `requireAdminSession`)

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/admin/analytics` | GET | 30-day overview: revenue, profit, orders, customers, top sellers, low stock |
| `/api/admin/catalog/products` (+`/[id]`) | GET/POST/PATCH/DELETE | full CRUD; smart delete (archive if referenced); writes purge ISR via `revalidateCatalog` (as do categories and brands) |
| `/api/admin/catalog/categories` (+`/[id]`) | GET/POST/PATCH/DELETE | delete blocked if products attached |
| `/api/admin/catalog/brands` (+`/[id]`) | GET/POST/PATCH/DELETE | delete blocked if products attached |
| `/api/admin/coupons` (+`/[id]`) | GET/POST/PATCH/DELETE | delete blocked if used by orders |
| `/api/admin/orders` (+`/[id]`) | GET/PATCH | list all (no server pagination); status transition + note |
| `/api/admin/payments` | GET | pending COD/bank-transfer/fee-verify payments |
| `/api/admin/payments/[id]/verify` | POST | verify/reject; `outcome` (`SUCCEEDED` or `FAILED`) is required |
| `/api/admin/payments/[id]/fee` | POST | COD confirmation fee: verify/reject; VERIFIED confirms order and sends email |
| `/api/admin/payments/[id]/txn-id` | POST | admin sets/replaces COD txn ID; returns 409 on duplicate with meta.existingOrderId |
| `/api/admin/settings/payments` | GET/PUT | read/update PaymentSettings (methods enabled, COD fee rule, QR, contact, note); GET returns `gatewayConfigured` too |
| `/api/admin/users` (+`/[id]`) | GET/POST/PATCH | list/create/edit users incl. role; no delete |
| `/api/admin/warranty` (+`/[id]`) | GET/PATCH | list/filter; status transition + resolution |
| `/api/admin/media/upload` | POST | Cloudinary upload, 5 MB, type allowlist |
| `/api/admin/media/delete` | POST | Cloudinary destroy |

## Misc

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/health` | GET | returns `{message:'OK'}`; no DB ping |
