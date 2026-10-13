# Frontend

## Route groups

- `src/app/(public)` — storefront, wrapped by header/footer layout.
- `src/app/(dashboard)` — admin, wrapped by sidebar layout that server-checks `role === 'ADMIN'`.
- Shared error surfaces: `error.tsx`, `global-error.tsx`, `not-found.tsx`. **No `loading.tsx` anywhere** (gap).

## Storefront pages

| Route | Rendering | Data | Metadata |
| --- | --- | --- | --- |
| `/` (home) | Server, ISR `revalidate 120` | featured products server-fetched | static; `sr-only` h1 |
| `/products` | ISR `revalidate 60`; filtered URLs rewrite to the dynamic `/live/products` twin | server fetch (Redis-cached) | static; canonical `/products` |
| `/products/[slug]` | ISR `revalidate 120`, built on first hit (empty `generateStaticParams`) | cached server fetch; first 10 reviews + summary in the HTML | `generateMetadata` + OG + Product JSON-LD (`aggregateRating` when reviews exist) + breadcrumbs |
| `/category/[slug]`, `/brand/[slug]` | ISR `revalidate 60`; filtered URLs rewrite to `/live/category/[slug]`, `/live/brand/[slug]` | server fetch, `notFound()` if unpublished | `generateMetadata`, canonical to the base path |
| `/cart`, `/checkout` | Client (checkout page server-gates auth) | React Query | none (noindexed via robots) |
| `/orders/[id]`, `/orders/[id]/bank-transfer` | Client | React Query | none |
| `/account/{orders,addresses,reviews}` | Client, redirect via `useEffect` | React Query | none |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | Client (+ server actions for signup/forgot/reset) | — | none |

## Admin pages (`/dashboard/*`)

Dashboard (analytics cards), Orders (+detail with COD fee panel), Payments (with fee verify), Warranty, Products (+new/edit), Categories, Brands, Coupons, Users, Settings (payment methods, COD fee rule, QR upload, contact, note). All client components using React Query hooks from `src/modules/admin/**`; tables via shared `src/components/data-table.tsx` (client-side pagination/filtering only).

## Module structure (`src/modules/<domain>`)

Each domain has `hooks.ts` (React Query wrappers over `src/lib/fetcher.ts`) and `components/`. Key ones:

- `storefront/` — product-card, product-grid, product-filters, product-detail (server component + JSON-LD), gallery, purchase panel, pagination.
- `cart/` — `guest-cart.ts` (Zustand + localStorage), `hooks.ts` (`useCart` branches guest/server; `useGuestCartMerge` on login), add-to-cart button (always qty 1).
- `checkout/` — `checkout-payment-card.tsx`, `order-summary-card.tsx`, `txn-id-input.tsx` (blur-validated), `add-txn-id-card.tsx` (order page), hooks (`useCheckoutQuote` keyed, `usePaymentConfig`, `usePaymentSelection`, `useCheckoutTxnId`, `useTxnCheck`). `checkout-quote.ts` holds pure helpers: `isCodFeeActive` (fee UI follows the settled COD quote) and `isFeeConfigStale` (quote shows a fee, cached config says off: refetch config once).
- `orders/` — shared components (`order-items-card`, `order-events-card`, `order-totals-rows`, `cancel-order-card`, `warranty-request-card`, `order-fee-section`, `fee-summary-rows`, `format-ship-address`), admin dialogs (`admin-txn-id-dialog`, `reject-fee-dialog`, `pending-action.ts`).
- `auth/` — server actions (`actions.ts`: signup/forgot/reset), auth-card, google-button.
- `reviews/` — `reviews-section.tsx` is a server component (summary + first 10 reviews); `show-all-reviews.tsx` is the client island that fetches the full list on click; `hooks.ts` holds the review queries and the submit mutation.
- `orders/`, `account/`, `warranty/`, `admin/*` — hooks + forms.

## State management

- **Server state**: TanStack Query, keys centralized in `src/constants/queryKeys.ts` (includes `checkoutQuote` keyed per selection, `paymentConfig` staleTime 30s, admin: `adminOrders`, `adminOrdersList`, `adminOrderDetails`, `adminOrderDetail(id)`, `adminPaymentsPending`; narrower `invalidateAdminPaymentViews(qc, orderId)` for payment updates). Defaults: `staleTime 30s`, `retry 1`, no refetch on focus.
- **Client state**: Zustand only for guest cart.
- **Session**: `useSession` client-side; `auth()` only in leaf server pages (checkout, dashboard layout), never in the root or `(public)` layouts, which would make every page dynamic and defeat ISR. `SessionProvider` therefore mounts with `session={null}` (no `/api/auth/session` request) except on `/login`, `/account`, `/orders` and `/checkout`; a returning user is detected by a localStorage boolean (`Cryptech.authHint`, `src/lib/auth-hint.ts`; also set on the OAuth return `?auth=1`) that makes `AuthHintSync` in `src/components/providers.tsx` fetch the session once. The hint only decides whether the client asks for a session; every API still calls `requireSession()`. Any page that needs the session on first paint (gates on `useSession` status) must be added to `SESSION_PATHS` in `src/components/providers.tsx`, otherwise a client navigation to it sees "unauthenticated" until a full page load.
- Providers stack in `src/components/providers.tsx`: Session → Theme (next-themes) → QueryClient → AuthHintSync + CartBootstrap (guest-merge) → Toaster.
- Cart badge: `useCartBadgeCount()` (`src/modules/cart/hooks.ts`) reads the guest store (0 requests) or, when signed in, `GET /api/cart?view=summary` (5 min stale, updated by cart mutations); the full cart is fetched only when the cart panel opens (`src/app/components/cart-panel/cart-panel.tsx` mounts the body inside the sheet).

## Rendering conventions

- Catalog content is **server-rendered** (crawlable), including the first 10 PDP reviews; only the full review list loads client-side.
- Header (`src/app/components/header/header.tsx`) is a server component; only its leaves are client islands: `header-search.tsx` (search preview: starts at 3 characters, 400 ms debounce, abort, 60 s per-tab result cache, Enter always goes to `/products?q=`), `header-account.tsx`, `mobile-search-toggle.tsx`, the cart panel, the category sidebar and the menu flyout.
- Images via `next/image` with Cloudinary remote pattern; the home banner is a single `priority` image. Fonts via `next/font/local`: three subsetted Google Sans woff2 files (400/500/600) in `src/app/fonts`, `display: 'swap'`; Bold and Italic are not shipped, so avoid `font-bold` and `italic`.

## Known frontend quirks (full list: [../KNOWN-ISSUES.md](../KNOWN-ISSUES.md))

- Category page passes `brand={category}` to `CommonListPage` — locks the wrong filter.
- Client account pages flash a loader before auth redirect (not server-gated).
