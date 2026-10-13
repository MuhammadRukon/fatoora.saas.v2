# SEO Audit

Audit date: 2026-07-11, re-verified 2026-10-13. Verdict: **solid foundation; a few low-impact gaps remain.** Catalog content is server-rendered and crawlable (including the first 10 PDP reviews), the sitemap and robots exist, the PDP has OpenGraph + Product JSON-LD with `aggregateRating`, canonicals and breadcrumbs are in place, and search results are `noindex`.

**Open items (2026-10-13):** #7 category/brand descriptions and OG tags, #6 per-page Twitter metadata (root default only), #13 image sitemap entries, #15 custom `not-found` metadata. Everything else below is done and kept for history.

## What's already good ✅

- **Server-rendered catalog**: home, `/products`, PDP, category, brand pages are all server components with ISR (`revalidate` 60–120) — content is visible to crawlers. Filtered/search views rewrite to `/live/*` twins that canonicalize to the base path; a search (`q`) or direct `/live/*` hit is `noindex` (`src/app/components/listing-query.ts`).
- **Dynamic sitemap** (`src/app/sitemap.ts`): all published products (up to 5000), categories, brands with `lastModified`/priority.
- **robots.ts**: sensible disallows (api, dashboard, account, cart, checkout, auth pages), sitemap + host declared.
- **PDP metadata**: `generateMetadata` uses per-product `metaTitle`/`metaDescription` (admin-editable fields exist!), OpenGraph with product image.
- **Product JSON-LD** on PDP (`product-detail.tsx` `buildJsonLd`): name, description, images, brand, sku, single Offer with BDT price and availability — server-rendered.
- **Security headers** (`X-Content-Type-Options`, `X-Frame-Options: DENY`, HSTS) set in `next.config.ts`; no iframe usage in the codebase.
- **Title template** (`%s | Cryptech`) in root layout; `lang="en"`.
- **next/image everywhere** with mostly-good alt texts; self-hosted subsetted woff2 fonts via `next/font`.

## Gaps, by impact

### HIGH

1. ~~**No `metadataBase`, no canonical URLs** — zero matches for `metadataBase`/`canonical`/`alternates` in `src`. Filtered/paginated listing URLs (`/products?page=2&sort=…`) have no canonical, risking duplicate-content dilution; OG image URL resolution is unspecified.~~ (✅ completed — `metadataBase` set in `src/app/layout.tsx`; `alternates.canonical` added on home, `/products`, PDP, category, brand. Filtered/sorted listing query strings still canonicalize to their base path, by design.)
2. ~~**Reviews are invisible to crawlers and absent from structured data** — PDP reviews load via `next/dynamic ssr:false` (`deferred-reviews-section.tsx`), and Product JSON-LD has no `aggregateRating`/`review`. You forfeit star rich results, the single biggest e-commerce SERP CTR lever.~~ (✅ completed — PDP fetches the summary server-side and `buildJsonLd` adds `aggregateRating` when `count > 0`; the newest 10 reviews are also in the ISR HTML, the full list loads on "Show all reviews".)
3. ~~**No `BreadcrumbList` JSON-LD and no visible breadcrumbs** — a `CustomBreadcrumb` component exists but is never used. Category → product breadcrumbs help both UX and SERP display.~~ (✅ completed — `CustomBreadcrumb` wired into PDP (Home → Brand → Product) and `CommonListPage` (Home → Category/Brand/All products); matching `BreadcrumbList` JSON-LD via new `buildBreadcrumbJsonLd` helper.)
4. ~~**Home page has no `<h1>`**; listing pages have an out-of-order `<h2>Filter Panel</h2>` before the `<h1>` (`product-filters.tsx:73`).~~ (✅ completed — home page has a `sr-only` `<h1>`; "Filter Panel" demoted from `<h2>` to a non-heading `<span>` since it sits before the page's own `<h1>` in DOM order.)

### MEDIUM

5. ~~**No `Organization` / `WebSite` JSON-LD** (logo, name, social profiles; `WebSite` + `SearchAction` can enable a sitelinks search box).~~ (✅ completed — static JSON-LD in `src/app/layout.tsx`; `SearchAction` targets existing `/products?q=`. No social profile links exist in the codebase, so `sameAs` was left out rather than invented.)
6. ~~**No Twitter card metadata** anywhere.~~ (✅ partially — basic `twitter: { card: 'summary_large_image' }` added to root metadata in `src/app/layout.tsx`; per-page `twitter` overrides with title/image still open.)
7. **Category/brand pages have generic descriptions** and no OG tags; no description field exists on the Category/Brand models to source from.
8. ~~**Missing trust pages** (About/Contact/Privacy/Terms/Refund — footer links point to `/`). Thin-content/trust signal for Google, especially for e-commerce ("Your Money or Your Life" scrutiny). Also see FEATURE-GAPS P0.~~ (✅ completed — all five pages live, footer-linked, in sitemap)
9. ~~**`sitemap.ts` declares `dynamic='force-dynamic'` alongside `revalidate=3600`** — force-dynamic wins; the sitemap queries the DB on every crawler hit. Remove `force-dynamic` to serve it from ISR cache (also saves free-tier function invocations).~~ (✅ completed)
10. ~~**Env drift**: sitemap/robots read `NEXT_PUBLIC_APP_URL` but `.env` defines `NEXT_PUBLIC_BASE_URL` — currently held together by the `NEXTAUTH_URL` fallback. If that ever changes, sitemap URLs silently become `http://localhost:3000/...`.~~ (✅ completed — `NEXT_PUBLIC_APP_URL` standardized + validated in `src/env.ts`)

### LOW

11. ~~Fonts are `.ttf` (convert to `woff2` — smaller, faster LCP/CLS).~~ (✅ completed — three subsetted woff2 files, `display: 'swap'`)
12. ~~Duplicate hero image loaded twice with `priority` on home (LCP waste).~~ (✅ completed — single banner image)
13. No image entries in the sitemap (product image sitemaps help Google Images traffic).
14. ~~`/products?q=` search results are indexable — consider `noindex` on search-result views.~~ (✅ completed — `q` requests are served from `/live/products`, which is `noindex`)
15. 404 page exists (good); no custom `not-found` metadata.

## Recommended order of work

1. ~~`metadataBase` + canonicals (one file + small per-page additions).~~ (✅ completed 2026-09-30)
2. ~~Server-render review summary + `aggregateRating` in Product JSON-LD.~~ (✅ completed 2026-09-30)
3. ~~Breadcrumbs (visible + JSON-LD) on PDP/category/brand.~~ (✅ completed 2026-09-30)
4. ~~h1 fixes (home; remove "Filter Panel" heading).~~ (✅ completed 2026-09-30)
5. ~~Organization/WebSite JSON-LD in root layout.~~ (✅ completed 2026-09-30, along with basic Twitter card)
6. ~~Trust pages (shared with FEATURE-GAPS P0).~~ (✅ completed)
7. Sitemap cleanup (`force-dynamic`, env var name, image entries). (⚠️ `force-dynamic` + env var completed; image entries still open)
