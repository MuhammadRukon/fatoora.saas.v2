# Redis + ISR Caching Strategy Plan (gadget-website)

Status: APPROVED 2026-10-12, revision 2 (production log + Prisma usage folded in, app fixes ordered before Redis). Planning only. No code changed.
Branch: `feature/redis-isr-caching` (renamed from the empty `feature/redis-implementation`, see Workspace setup; `main` is its ancestor). PR target `dev` per `git-hygiene`.
Skills the executor invokes: `tdd` (Phases 1-6, test first), `ecc:redis-patterns` (key/TTL review in Phase 3), `ecc:security-review` (Phases 1, 4 + Cross-Validation), `ecc:verification-loop` and `code-review` (Cross-Validation), `git-hygiene` (commits/PR).

---

## 1. Summary

Cryptech (Next.js 16, Prisma Postgres, Vercel, functions already in sin1) has no caching beyond `export const revalidate`, and that is mostly ineffective. Production logs (2026-10-12) prove `/products/[slug]`, `/category/[slug]`, `/brand/[slug]`, `/products` render per request (`vercelCache: MISS`), and that every `<Link>` the user can see on the home page triggers a dynamic prefetch: one home view caused ~20 function invocations, each with DB queries. Prisma usage already shows 16,019 of 200,000 free operations for Oct 1-12 on light testing. Nothing invalidates on admin edits. The signup/forgot/reset UI calls server actions with no rate limit. Search is the heaviest query (`ILIKE` trigram OR, up to 500 rows scored in JS, unbounded `q`).

Goal (confirmed): decide per feature whether Redis or Next ISR/HTTP caching earns its place, rank by ROI including infra cost, and give an implementation guide for what to build NOW against current features, plus a FUTURE register with adoption triggers. Redis IS going in (owner decision), but the app is fixed first: ISR and cheap fixes remove most load for $0, then Redis covers what ISR cannot (filtered/search results, rate limiting, abuse bounding, future features).

Approach: Phase 1 app fixes (no Redis), Phase 2 ISR for listing pages via a config-level rewrite split, then the Redis foundation, rate-limit backend, dynamic-listing cache, guest-cart cache. Rejected simpler option: Redis only (would cache the symptom, prefetch fan-out and per-request renders stay). Rejected larger options: Redis behind ISR via `cacheHandler`, `use cache`/`cacheComponents` migration (not applicable on Vercel / large refactor, see 5.3), and a client-side-fetch listing (larger refactor, see Out of scope).

---

## 2. Findings (file:line)

### 2.1 Rendering modes, now confirmed by the production log (deployment `dpl_8GUBodZKTmnU6WgA78828MMa1P6X`)

| Route | Observed in log | Cause (code) | Server DB calls per render |
|---|---|---|---|
| `/` | `STALE` (background regen) then `HIT` on `_rsc`: real ISR | `src/app/(public)/page.tsx:15` | ~4 per regeneration |
| `/products` | `MISS`, function `/products.rsc` | `await searchParams` `src/app/(public)/products/page.tsx:19`; `revalidate=60` at `:12` is dead | 6 (layout 2 + list 2 + brands 1 + categories 1) |
| `/category/[slug]`, `/brand/[slug]` | `MISS`, 8-809 ms | `category/[slug]/page.tsx:41`, brand `:35` | 7 |
| `/products/[slug]` | `MISS`, 1088 ms cold, then 25-481 ms | no `generateStaticParams`, `products/[slug]/page.tsx:12` | 4, plus 2-3 from client `/api/reviews` |
| `/about`, `/terms`, `/contact`, `/cart`... | `PRERENDER` then `HIT`/304 in 3-20 ms | static shells | 0 (menu baked at build) |
| `/api/catalog/products` | dynamic | reads `request.url` `products/route.ts:11` | 2-3 |
| `/api/auth/session` | one function run per full page load, 12-645 ms | `SessionProvider` without `session` prop (`components/providers.tsx:31`) | 0 DB (JWT) |
| `/api/cart` | one function run per full page load, 160-200 ms | `ensureCart` upsert + queries (`cart.service.ts:45-51,105-142`) | ~5 |
| `/api/reviews` | 44-764 ms on each product view | duplicates SSR summary (`api/reviews/route.ts:14-17`) | 2 |

Function region is already sin1 (all runs), static assets served from bom1. No `vercel.json` needed.

### 2.2 Prefetch fan-out (new, biggest finding)
One home page view fired ~9 dynamic `_rsc` function runs per prefetch round (3 categories, 5 product pages, `/products`, plus `brand/apple`), repeated for a second round, plus `/api/cart`, `/api/auth/session`, and later `/api/reviews`. Home `_rsc` requests are `HIT` at ~100 ms because `/` is ISR. Making the target routes ISR turns each prefetch into a CDN hit. This single change removes most function invocations (Vercel Hobby includes 1M/month) and most Prisma operations. Estimated 30-100 Prisma operations per home view today; Phase 0 measures it exactly.

### 2.3 DB hot paths (Prisma operations = queries)
- Search: `buildPublicProductWhere` `catalog.service.ts:475-503` ORs `ILIKE '%x%'` over name/brand/sku for every 3-char window; `:535-570` loads up to 500 rows and scores in memory. `q` has no max length (`src/contracts/catalog.ts:106`). Header preview fires it per 400ms pause (`src/hooks/use-header-search-preview.ts:33-38`). No trigram index.
- `POST /api/cart/hydrate`: public, no limiter, `lines` unbounded (`src/contracts/cart.ts:38-41`), 3 queries (`cart.service.ts:206-247`).
- Logged-in cart badge: `getCartSummary` runs an `ensureCart` upsert (a write on a read) + nested findMany.
- Rate limiter: 2-3 Postgres round trips per call (`rate-limit.ts:26-56`); expired `RateLimitBucket` rows never swept (`schema.prisma:415-422`).
- **Gap: the UI calls `signupAction` (`src/modules/auth/actions.ts:42`), `forgotPasswordAction` (`:62`), `resetPasswordAction` (`:85`), which have NO limiter.** The limited REST routes (`api/auth/*`) are not what pages call.
- Authenticated `POST /api/checkout/quote` is unlimited (coupon-code brute force via `couponsService.validate`).
- Analytics `overview` loads all 30-day order items (`analytics.service.ts:46-64`): admin-only.
- Checkout `placeOrder`/quote/coupon: user-specific, authoritative (`checkout.service.ts:183-371`, stock guard `:299-308`, coupon guard `:314-326`).

### 2.4 Write/invalidation hook points
Admin routes under `src/app/api/admin/catalog/{products,categories,brands}` (service lines: `catalog.service.ts` brand 142/160/181, category 203/224/248, product 281/343/777). `updateProduct` reads the old slug at `:347`: invalidate old and new slug. Category/brand rename dirties product cards too. PDP exposes only boolean `inStock` (`catalog.service.ts:67`), so a stale PDP cannot oversell (add-to-cart, quote, `placeOrder` re-read live stock); price is the real hazard (checkout charges live price).

### 2.5 Auth / role staleness
JWT role is trusted for its full lifetime (`proxy.ts:5-8`, `http.ts:38-42`, `users.service.ts:65-93`). Cheaper than Redis: a primary-key `select role` in `requireAdminSession` or an `authVersion` column. Hence F3 is NOT-REDIS.

### 2.6 Measured usage and constraints
Prisma Postgres dashboard: 16,019 operations Oct 1-12 (~1.3K/day) of 200,000 included, storage 1.77 MiB of 512 MiB. (The dashboard label says "21% used" while 16,019/200,000 is 8%; Phase 0 clarifies which counter moves.) `CLAUDE.md:9` says cost-sensitive, "this is why rate limiting is a Postgres table, not Redis" (updated in Phase 3). `SCALE-UP-TODO.md:118`: new paid infra under ~1% of monthly revenue. Owner declined editing `SCALE-UP-TODO.md`.

---

## 3. Busiest paths: ranking method and evidence

No authoritative public benchmark gives page-type share of page views (searched). Sourced anchors: pages/session 1.5-5.6 (single blog, unverified); site search used by ~15-25% of visitors but ~44% of revenue at 2.5x conversion (Constructor, 113 retail sites, vendor study; vendor blogs claim 30-50%, weak); Redis/Medusa guidance: cache-aside with hashed query keys, example TTLs listings 60s / product 300s / categories 600s, hit ratio above 90% healthy, below 80% means key/TTL problem. Ranking is by `hits x invocations/queries per hit`, now using the real production log instead of assumptions.

| Rank | Path | Evidence | Verdict |
|---|---|---|---|
| 0 | Prefetch fan-out from home/listing/menu links to dynamic routes | log: ~20 invocations per home view | ISR (Phases 1-2); biggest win |
| 1 | PDP | `MISS` every view, +2 reviews calls | ISR (Phase 1) |
| 2 | Listing/category/brand default view | `MISS` every view and prefetch | ISR via rewrite split (Phase 2) |
| 3 | Filtered/paged/search listing | stays dynamic by design | Redis (N3, Phase 5) |
| 4 | Search preview `/api/catalog/products?q=` | per keystroke, heaviest query | cap (Phase 1) + limiter + Redis (Phases 4-5) |
| 5 | Logged-in cart badge `/api/cart` | one run per page load, write-on-read | remove write-on-read (Phase 1) |
| 6 | Guest hydrate | public, unauthenticated | cap (Phase 1), Redis (Phase 6) |
| 7 | Auth actions/checkout/quote hits | unprotected actions | limiter (Phase 1 Postgres, Phase 4 Redis) |

---

## 4. Candidate register

Tags: [NOW] buildable against current features. [FUTURE] needs a roadmap feature that does not exist yet. Verdicts: REDIS, LATER (Redis, needs trigger), NOT-REDIS. Priority is ROI order.

### 4.1 NOW

| ID | Candidate | Verdict | Prio | Design | Why |
|---|---|---|---|---|---|
| R1 | PDP effectiveness | NOT-REDIS | 1 | `generateStaticParams` returning `[]`; `revalidatePath` on admin product writes (old and new slug) | free; log shows MISS every view |
| R10 | Listing/category/brand default views as ISR | NOT-REDIS | 2 | rewrite split: requests with a filter query key are rewritten (config level, no function) to a dynamic `live/*` route; everything else (incl. `utm_`/`fbclid` ad params) is ISR | kills prefetch fan-out; keeps UX and SEO identical |
| R2 | Frozen menu on static pages | NOT-REDIS | 3 | `revalidatePath('/', 'layout')` on admin brand/category writes | menu baked at build |
| R3 | Catalog API HTTP caching | NOT-REDIS | 4 | `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` on `/api/catalog/*` only | CDN absorbs repeats |
| R4 | Reviews double fetch | NOT-REDIS | 5 | pass SSR summary to client; `s-maxage=60` on `/api/reviews` GET | -2 calls per PDP view |
| R5 | Cart write-on-read | NOT-REDIS | 6 | read-first `findUnique`; create cart on first mutation | removes upsert per page load |
| R11 | Rate-limit the 3 auth server actions + input caps | NOT-REDIS (existing Postgres limiter) | 7 | same policies as REST routes; `q` max 100, hydrate `lines` max 50 | closes real abuse holes, no new infra |
| N3 | Dynamic listing/search result pages and `/api/catalog/products` | REDIS | 8 | `cat:list:v1:<hash(canonical parsed query)>` TTL 60s (+/-10%); with `q`: `cat:search:v1:<hash>` TTL 120s; empty TTL 30s; cache ranked page DTO only, skip if payload > 100KB; TTL-only invalidation | filtered/search stay dynamic by design; this keeps them cheap |
| N1 | Rate-limit backend on Redis + limiters on hot public endpoints (hydrate, catalog `q`, quote, review POST, warranty POST) | REDIS | 9 | `rl:<sha256(key)[0:32]>`, TTL=window, 1 command (Lua INCR+PEXPIRE via `eval`); Redis error -> Postgres limiter | Postgres limiter would add 2-3 ops per hot call; Redis is 1 command |
| N2 | Catalog shell (menu + brands + categories) | LATER | 10 | `cat:shell:v1` TTL 300s, `DEL` on admin writes | after Phase 2 only the live listing route and `/checkout` still run the layout queries; trigger: Prisma ops above 100K/mo |
| N4 | Guest cart hydrate per-variant snapshot | LATER | 11 | `var:v1:<variantId>` TTL 30s, MGET, quantities never cached | trigger: hydrate calls above ~2K/day |
| R6 | Admin analytics | NOT-REDIS | - | SQL aggregates later | admin-only |
| R7 | Coupon definition lookup | NOT-REDIS | - | 1 query, checkout only | no volume |
| R8 | Orders, addresses, account, quote, checkout tx, payments, sessions, anything per-user/PII | NEVER cache | - | correctness + privacy | - |
| R9 | ISR backed by Redis | NOT ON VERCEL | - | see 5.3 | - |
| R12 | `/api/auth/session` per full page load | NOT-REDIS, no change | - | JWT decode, no DB; passing `session` from server `auth()` would make the root layout dynamic and break ISR | acceptable |

### 4.2 FUTURE (roadmap items, none exist today)

| ID | Feature (source) | Verdict | Redis design sketch | Adopt when |
|---|---|---|---|---|
| F1 | SMS OTP login/verify (FEATURE-GAPS P3) | REDIS | `otp:<phoneHash>` TTL 300s, attempt counter, send limiter via N1 | OTP feature built |
| F2 | Stock reservation / flash sale (checkout-concurrency-plan:152) | LATER | `stock:avail:<variantId>` counter, atomic Lua decrement, reservation key with TTL; Postgres conditional update stays source of truth | flash sale planned or 409 stock-conflict rate above ~2% of checkouts on a hot SKU |
| F3 | Session/role revocation (JWT role stale) | NOT-REDIS | DB `select role` in `requireAdminSession` or `authVersion` column; Redis `authver:<userId>` only if staff count/volume makes DB lookups costly | staff roles (Stage 3) |
| F4 | COD fraud: refuser counters + blocklist (SU:89) | LATER | `cod:refuse:<phoneHash>` counter, blocklist cache in front of a Postgres table | COD refusal rate above ~10% or Stage 3 |
| F5 | Online-gateway callback idempotency pre-check | LATER | `idem:<gateway>:<ref>` SET NX EX; DB compare-and-set stays authoritative | bKash/SSLCommerz re-enabled |
| F6 | View/trending counters | REDIS | `views:<yyyymmdd>:<productId>` INCR, flushed to Postgres by job | trending feature built |
| F7 | Related products (FEATURE-GAPS P1, SU:57) | REDIS | `cached()`: `rel:v1:<productId>` TTL 1h | feature built |
| F8 | Store settings / banners (FEATURE-GAPS P2) | REDIS | `cfg:v1:<name>` TTL 300s, `DEL` on admin save | feature built |
| F9 | Admin 2FA TOTP replay guard (SU:64) | REDIS | `totp:used:<userId>:<window>` TTL 90s | 2FA built |
| F10 | Search upgrade (tsvector/Meilisearch, SU:45) | KEEP N3 | N3 keeps caching results; add facet-count keys | search engine adopted |
| F11 | Co-view/co-purchase recommendations (SU:87) | LATER | sorted sets | Stage 3 with behavioral data |
| F12 | Coupon abuse limiter | REDIS | reuse N1 keyed per code+user | referral/first-purchase codes shipped |
| X1 | Back-in-stock notify (FEATURE-GAPS:39, SU:55) | NOT-REDIS | Postgres `StockSubscription` table + job; optional Redis send-dedupe | - |
| X2 | Wishlist, recently viewed, comparison | NOT-REDIS | Postgres table / localStorage / client | - |
| X3 | Abandoned cart, review-request mails, order expiry sweep, courier sync | NOT-REDIS | job runner or Vercel cron + existing `(status, createdAt)` index | - |
| X4 | Coupon usage counters (SU:23 suggestion) | NOT-REDIS | stays transactional in Postgres (`checkout.service.ts:314-326`) | - |

---

## 5. Financial analysis

### 5.1 Prices used (retrieved 2026-10-12; verify before purchase)
- Upstash Redis: Free 500K commands/mo, 256MB, 10GB bandwidth. Pay-as-you-go $0.20 per 100K commands, first 1GB storage free, budget cap available. Fixed $10/mo (250MB). Singapore (ap-southeast-1) available. Free-tier behavior above 500K is NOT documented; inactivity archive after 30 days (one source says 14).
- Prisma Postgres (your dashboard confirms Free = 200K operations/mo, 512 MiB): Starter $10 incl. 1M ops then $8/M, Pro $49 incl. 10M then $2/M. One operation = one query (nested relation loads may bill more: unverified). Pooled connections: 10 on Free, 100 on Starter. Accelerate retires 2026-12-01: do NOT use `cacheStrategy`.
- Vercel: Hobby includes 1M function invocations/mo and is non-commercial only; a store belongs on Pro (~$20/mo). Separate owner decision, not a Redis cost. Pro invocations $0.60 per 1M; sin1 ISR reads $0.52/M, writes $5.20/M.

### 5.2 Model (assumptions labeled; Phase 0 measures ops per page view and replaces them)
Assumption from one log trace: today ~20 Prisma ops and ~15 invocations per page view blended (home-origin views ~30-100 ops, others fewer). After Phases 1-2: ~1.5 ops and ~2 invocations per page view (ISR regeneration, cart/session/reviews-free, filtered views). After Redis on filtered/search: ~1.0 ops. Redis commands ~0.5 per page view.

| Scenario | PV/mo | Prisma ops today -> after P1+P2 -> after Redis | DB bill today -> P1+P2 -> Redis | Invocations today -> after P1+P2 | Redis bill | Net Redis saving over P1+P2 |
|---|---|---|---|---|---|---|
| A | 20K | 400K -> 30K -> 20K | $10 -> $0 -> $0 | 300K -> 40K | $0 | $0 |
| B | 150K | 3.0M -> 225K -> 150K | $26 -> ~$10 -> $0 | 2.3M (over Hobby 1M) -> 300K | $0 | ~$10/mo |
| C | 1M | 20M -> 1.5M -> 1.0M | $69 -> $14 -> $10 | 15M -> 2M | ~$0.5 | ~$4/mo |

Honest reading: the app fixes capture almost all savings (A: ~$10/mo and a free-tier breach avoided, B: ~$16/mo plus staying under 1M invocations, C: ~$55/mo). Redis adds ~$0-10/mo of DB savings on top. It is justified by (1) bounding abuse on search/hydrate and a real rate limiter, (2) keeping filtered/search views cheap, (3) unlocking F1-F12 without new infra, (4) deferring a DB tier upgrade. Redis cost is ~$0 until ~500K commands/mo.

### 5.3 Redis behind ISR: NOT ON VERCEL
`cacheHandler` (ISR/route handlers/images) and `cacheHandlers` (`use cache`) target Node/Docker self-hosting (Next docs platform table); Vercel runs its own durable ISR (single region following the function region, purge ~300ms). Redis there adds commands and latency and improves nothing. Revisit only if the app leaves Vercel for multi-instance self-hosting. `use cache`/`cacheComponents` migration is out of scope.

### 5.4 Tier triggers
- Stay on Free while commands < 400K/mo (80%). Above: pay-as-you-go with hard budget cap $5/mo and 80% alert. Fixed $10 plan only above ~5.5M commands/mo.
- Phases 3-4 build and deploy with env unset until Phase 7 passes, then enable (free, fail-open). Phases 5-6 code ships fail-open too; if measured Prisma ops after Phase 2 are below 50K/mo, leave their benefit unmeasured but harmless, and set the enable trigger at Prisma ops above 100K/mo.
- If Redis cost exceeds 1% of monthly revenue, defer new Redis features. Keep-Redis metrics: dynamic-listing hit ratio at least 85%.

---

## 6. Constraints, assumptions, risks, unknowns

Non-negotiable: never cache per-user or PII data (carts, orders, addresses, quote, sessions, `User` rows, `passwordHash`, `Payment.rawPayload`); checkout transaction and `placeOrder` re-validation never read Redis or ISR output; cache only DTOs of PUBLISHED data; keys built from the parsed Zod query, never raw URL or request-supplied ids; rate-limit keys hashed (they embed email/IP); Redis failure never breaks a request (fail-open) and never disables protection (limiter falls back to Postgres); no schema migration.

| Item | Mitigation / owner |
|---|---|
| Rewrite rules drift from `productListQuerySchema` filter keys, so a new filter key would hit the ISR route and be ignored | unit test asserts every schema filter key has a rewrite rule (Phase 2) |
| Ad params (`utm_*`, `fbclid`) must stay on the ISR route | acceptance criterion in Phase 2 |
| Rewrite `has` query matching and ISR on Vercel behave as documented | verified on preview in Phase 2 before merge; fallback: keep dynamic route and rely on Phase 5 cache |
| Prisma ops per page view is an estimate from one trace | Phase 0 measures before/after |
| Prisma "21% used" label vs 8% arithmetic | Phase 0 clarifies |
| Upstash free-tier overage behavior undocumented | fail-open + circuit breaker; owner sets budget cap and 80% alert |
| Free tier inactivity archive | production stays active; dev/staging leave env unset |
| Free tier is 1 database | env prefix `gw:<VERCEL_ENV>:` separates prod/preview |
| Listing/PDP stale up to revalidate window; PDP price vs live charge | admin edits revalidate immediately (Phase 1); checkout charges live price |
| Admin media delete leaves cached pages with a broken image (`api/admin/media/delete/route.ts:61`) | accepted until next revalidate; admin product save revalidates |
| `x-forwarded-for` trust for limiter | Vercel sets it; verify in Phase 4 |
| Server actions need client IP | read `headers()` `x-forwarded-for`; if absent use shared `unknown` bucket |
| Vercel Hobby non-commercial and 1M invocation cap | owner decision on Pro, outside this plan |

---

## 7. Workspace setup (first step)
1. Rename the branch (it has no commits beyond `main`, same SHA 65bce8b): `git branch -m feature/redis-implementation feature/redis-isr-caching`, then `git push origin -u feature/redis-isr-caching` and `git push origin --delete feature/redis-implementation` (owner confirms the remote delete). Verify `git status` clean and `git merge-base --is-ancestor main HEAD`. Plain branch, no worktree.
2. One commit per phase with `git-hygiene` prefixes (`feat:`, `fix:`, `chore:`, `refactor:`). PR into `dev`.

---

## 8. Phases

### Phase 0: Baseline and measurement (no code)
Scope: read-only; results go into "Execution results" below. H1 (PDP dynamic) and H2 (listings dynamic) are already confirmed by the 2026-10-12 production log; region is already sin1.
Steps: (1) fresh `npm run build`, record per-route mode table; (2) controlled test on production with a logged-out browser: note Prisma "Total Operations" before, load the home page once and wait for prefetches to finish, note ops after; count Vercel function invocations for that session from the log export; (3) repeat for one product page and one category page; (4) owner states the Prisma Postgres region and Vercel plan; (5) recompute 5.2 with measured ops per page view.
Acceptance criteria:
- [ ] Table lists every route in `.next/prerender-manifest.json` and `routes-manifest.json` from a fresh build with mode static / ISR(seconds) / dynamic.
- [ ] Measured Prisma ops delta for one cold home-page view recorded as a number, and function invocations for the same view recorded as a number (log baseline: ~20).
- [ ] Measured Prisma ops delta for one PDP view and one category view recorded.
- [ ] Which counter drives the dashboard "21% used" label is stated, or marked unknown.
- [ ] 5.2 recomputed with the measured numbers, each unreplaced number marked "assumed".
- [ ] Prisma Postgres region and Vercel plan recorded.

### Phase 1: App fixes, no Redis (PDP ISR, invalidation, headers, cart, auth limiter, caps)
Scope: `src/app/(public)/products/[slug]/page.tsx`; new `src/app/api/_lib/revalidate.ts` (only file importing `next/cache`; services stay Next-free per CLAUDE.md invariant); admin routes `src/app/api/admin/catalog/{products,categories,brands}/route.ts` and `[id]/route.ts`; `src/app/api/catalog/{products,products/[slug],brands,categories}/route.ts`; `src/app/api/reviews/route.ts`; the PDP client reviews component; `src/server/cart/cart.service.ts` (`getCartSummary`, `loadCart`); `src/modules/auth/actions.ts` (`signupAction`, `forgotPasswordAction`, `resetPasswordAction`); `src/contracts/catalog.ts:106`; `src/contracts/cart.ts` hydrate body.
Steps (test first where pure): (1) add `export async function generateStaticParams() { return []; }` to the PDP and move the non-standard exported `getProductBySlugCached` out of `page.tsx` (grep importers first); (2) `revalidateCatalog({productSlug?, previousSlug?})` calling `revalidatePath('/products/<slug>')` (old and new), `revalidatePath('/')`, `revalidatePath('/', 'layout')`, `revalidatePath('/sitemap.xml')`; call from route handlers only after a successful write; (3) `Cache-Control: public, s-maxage=30, stale-while-revalidate=60` on `/api/catalog/*` GET and `s-maxage=60` on `/api/reviews` GET; (4) pass the SSR `reviewSummary` into the client reviews section so it stops recomputing the summary; (5) `getCartSummary` and `loadCart` read-first with `findUnique` by `userId`, empty snapshot when no cart, `ensureCart` only in mutation paths; (6) wrap the three auth server actions with `enforceRateLimit` (existing Postgres limiter) using the same policies as the REST routes (signup 5/15min/IP, forgot 5/1h/IP, reset 10/1h/IP), IP from `headers()` `x-forwarded-for`; (7) `q` `.max(100)` and hydrate `lines` `.max(50)`.
Acceptance criteria:
- [ ] `next build` lists `/products/[slug]` as SSG/ISR; `.next/prerender-manifest.json` `dynamicRoutes` contains `/products/[slug]` with `initialRevalidateSeconds` 120.
- [ ] On a preview, second `GET /products/<slug>` returns `x-vercel-cache: HIT` or `STALE`, and the Vercel log shows no function run for it.
- [ ] `PUT /api/admin/catalog/products/<id>` changing `name` and a variant `sellingPriceCents` returns 200, and the next `GET /products/<slug>` shows the new name and price without waiting 120s.
- [ ] `PUT` changing the product slug from `a` to `b`: next `GET /products/a` is 404 and `GET /products/b` is 200.
- [ ] `POST /api/admin/catalog/brands` with a new published brand returns 201 and `/about` shows it in the header menu on next request.
- [ ] A failing admin write (409 duplicate slug) does not call the revalidate helper (unit test spy: 0 calls).
- [ ] `GET /api/catalog/products?limit=8` has `Cache-Control` equal to `public, s-maxage=30, stale-while-revalidate=60`; `GET /api/cart`, `/api/orders`, `/api/addresses` have no `public` in Cache-Control.
- [ ] Loading a PDP issues no client request that recomputes the review summary.
- [ ] `GET /api/cart?view=summary` for a user with no cart returns `{subtotalCents:0, itemCount:0, hasIssues:false}` and `prisma.cart.upsert` is called 0 times; the first add-item creates exactly 1 `Cart` row; two parallel first add-to-cart requests by one user produce no 500.
- [ ] 6th `signupAction` in 15 min from one IP returns the rate-limited error result (no user row created, no email sent); a different IP is unaffected; 6th `forgotPasswordAction` in 1 h sends no email; 11th `resetPasswordAction` in 1 h is rate-limited.
- [ ] `GET /api/catalog/products?q=` with 100 chars returns 200; 101 chars returns 422. `POST /api/cart/hydrate` with 50 lines returns 200; 51 lines returns 422.
- [ ] `grep -r "next/cache" src/server` returns 0 matches; `npm run typecheck && npm run lint && npm run test` pass.

### Phase 2: ISR for listing pages via a rewrite split
Scope: `next.config.ts` (`rewrites()` generated from the filter keys), `src/app/(public)/products/page.tsx`, `category/[slug]/page.tsx`, `brand/[slug]/page.tsx`, new dynamic twins `src/app/(public)/live/products/page.tsx`, `live/category/[slug]/page.tsx`, `live/brand/[slug]/page.tsx` sharing one extracted page component, `src/contracts/catalog.ts` (export the list of filter keys), tests `src/contracts/__tests__/listing-rewrites.test.ts`.
Design: the public routes stop reading `searchParams`: they render the default view (page 1, unfiltered) as ISR with `generateStaticParams` for published category/brand slugs and `revalidate = 60`. A config-level rewrite sends any request carrying one of the filter keys (`q`, `brand`, `category`, `sort`, `page`, `minPrice`, `maxPrice`, `inStock`, derived from `productListQuerySchema`) to the `live/*` twin, which is the current dynamic page (reads `searchParams`). The browser URL does not change. Other query params (`utm_*`, `fbclid`) stay on the ISR route. Rewrites run at the routing layer, so no function runs on ISR hits. Filtered pages set `<link rel=canonical>` to the base path; `?q=` pages set `robots: noindex`. This keeps server-rendered HTML for filtered and paged URLs, so there is no loading flash and no crawlability change. (Header/footer/menu prefetches target base URLs, which become CDN hits.) Also audit `<Link>` targets that remain dynamic after this phase and set `prefetch={false}` on them.
Acceptance criteria:
- [ ] `next build` lists `/products`, `/category/[slug]`, `/brand/[slug]` as SSG/ISR and the `live/*` routes as dynamic; `.next/prerender-manifest.json` `dynamicRoutes` contains `/category/[slug]` and `/brand/[slug]`.
- [ ] On a preview, second `GET /category/phones` is `x-vercel-cache: HIT`/`STALE` with no function run in the log.
- [ ] `GET /category/phones?utm_source=fb&fbclid=1` is also `HIT`/`STALE` (ad params do not force dynamic).
- [ ] `GET /category/phones?brand=apple` returns 200 (not 307/308), the browser URL is unchanged, the Vercel log function is `/live/category/[slug]`, HTML contains only Apple products, and `<link rel="canonical">` is `<origin>/category/phones`.
- [ ] `GET /category/phones?page=2` HTML contains the page-2 product links (server-rendered); `GET /products?q=iph` HTML contains `<meta name="robots" content="noindex">`.
- [ ] Unit test: every filter key of `productListQuerySchema` has exactly one rewrite rule per listing route; adding a key to the schema without a rule fails the test.
- [ ] Clicking a brand checkbox in the filter UI changes the URL to `?brand=apple` and shows the filtered list; breadcrumbs and JSON-LD still render.
- [ ] Admin price edit on a product in `phones`: default `/category/phones` shows the new price after the revalidate (immediately via `revalidatePath`, within 60s otherwise).
- [ ] After a fresh deploy, a second logged-out home-page load generates at most 3 Vercel function invocations in the log (baseline ~20), measured from the log export.
- [ ] Prisma ops delta for a second home-page load is at most 3 (baseline from Phase 0).
- [ ] `/sitemap.xml` output unchanged; `npm run typecheck && npm run lint && npm run test && npm run build` pass.

### Phase 3: Redis foundation
Scope: `package.json` (+`@upstash/redis`, the only new dependency: HTTP/REST suits serverless; TCP `ioredis` rejected for connection exhaustion), `src/env.ts` (optional `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), `.env.example`, new `src/lib/redis.ts`, new `src/server/common/cache.ts`, new `src/server/common/__tests__/cache.test.ts`, `CLAUDE.md` (line 9 and the Conventions rate-limit bullet).
Steps (test first): (1) `CacheStore` interface `{get, set(key,val,ttlSec), del(...keys), mget(keys), incrWindow(key, windowMs)}`; `upstashStore` (REST, 400ms timeout; `incrWindow` is one `eval`: INCR, PEXPIRE on first hit, return count+pttl); `memoryStore` for tests; (2) `getStore()` returns `null` when env unset; (3) `cached({key, ttlSec, jitter}, loader)`: GET -> hit returns parsed; miss -> per-instance in-flight dedupe -> loader -> SET; any store error/timeout logs a warning and returns the loader result; circuit breaker opens after 5 consecutive failures for 30s; (4) key builder prefix `gw:<VERCEL_ENV ?? NODE_ENV>:` and `stableHash(obj)` (sorted keys, sha1); (5) skip SET when payload > 100KB.
Acceptance criteria:
- [ ] With both env vars unset, `getStore()` is `null` and `cached(..., loader)` runs `loader` once per call (3 calls = 3 runs) and never throws.
- [ ] With `memoryStore`: 2 calls on one key run the loader 1 time; after TTL elapses (fake timers) the next call runs it again.
- [ ] A store whose `get` rejects: `cached` returns the loader value without throwing; after 5 consecutive failures the 6th call does not touch the store (store call count stays 5) until 30s later (fake timers).
- [ ] 10 concurrent `cached` calls on a cold key run the loader 1 time.
- [ ] A payload of 100KB+1 byte is returned but `set` is never called.
- [ ] `stableHash({a:1,b:2})` equals `stableHash({b:2,a:1})` and differs from `stableHash({a:1,b:3})`.
- [ ] Built key under env `production` starts with `gw:production:`; under `preview` with `gw:preview:`.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` pass; app boots with the Upstash vars unset.
- [ ] `CLAUDE.md` no longer says rate limiting is Postgres "not Redis"; it documents the optional fail-open Redis layer and the Postgres fallback.

### Phase 4: Rate-limit backend on Redis + limiters on hot public endpoints
Scope: `src/server/common/rate-limit.ts` (same exports and signatures), routes `api/cart/hydrate`, `api/catalog/products`, `api/checkout/quote`, `api/reviews` POST, `api/warranty` POST, new `src/server/common/__tests__/rate-limit.redis.test.ts` (existing `rate-limit.test.ts` stays as the Postgres-fallback suite).
Steps (test first): (1) `rateLimit` tries `store.incrWindow(hash(key), windowMs)` and maps to `{ok: count <= max, remaining, resetAt}`; null store or error falls back to the existing Postgres path; `clearRateLimit` deletes both; (2) key hashed with sha256 so email/IP never reach Redis; (3) new limiters: hydrate 60/min/IP; `/api/catalog/products` only when `q` present 120/min/IP; quote 30/min/user; review POST 10/h/user; warranty POST 5/h/user; routes already map `RateLimitedError` to 429 + `Retry-After`; (4) record whether Vercel overwrites `x-forwarded-for`.
Acceptance criteria:
- [ ] With `memoryStore`, `rateLimit('k', {max:3, windowMs:30000})` called 4 times returns `ok` true,true,true,false and `remaining` 2,1,0,0; 4th `resetAt` within 30s of now; after fake timers advance 30001ms the next call returns `ok:true, remaining:2`.
- [ ] With a store whose `incrWindow` rejects, the 4th call still returns `ok:false` via Postgres (real-DB test style, random keys, cleaned up).
- [ ] No key in the fake store contains `@` or the raw IP for input key `login:1.2.3.4:a@b.com`.
- [ ] After a successful login `clearRateLimit` runs and the same key's next call returns `remaining` = max-1.
- [ ] 61st `POST /api/cart/hydrate` within 60s from one IP returns 429 with numeric `Retry-After`.
- [ ] 121st `GET /api/catalog/products?q=abc` within 60s from one IP returns 429; `GET /api/catalog/products?limit=8` (no `q`) is never limited.
- [ ] 31st `POST /api/checkout/quote` in 60s by one user returns 429; another user is unaffected.
- [ ] Existing REST call sites (`api/auth/*`, `api/checkout`, `authOptions.ts`) and the Phase 1 action limiters have no code diff other than the module internals (`git diff --stat`).
- [ ] `ecc:security-review` reports no new high findings.

### Phase 5: Dynamic listing cache (N3, and N2 shell if its trigger is met)
Scope: `src/server/catalog/catalog.service.ts` (`listPublicProducts` wrapped via `cached`; optional `getCatalogShell()`), new `src/server/catalog/__tests__/catalog-cache.test.ts`.
Steps (test first): (1) wrap `listPublicProducts` with key from the Zod-parsed query (stable hash): TTL 60s without `q`, 120s with `q`, 30s for empty `items`; (2) never cache when query parse fails; (3) if the trigger (Prisma ops above 100K/mo) is met, add `getCatalogShell()` = `cached('cat:shell:v1', 300s)` for layout/sidebars with `cacheDel` from admin brand/category/product writes.
Acceptance criteria:
- [ ] With `memoryStore`, two identical `listPublicProducts({brandSlug:'apple', page:1})` calls run `prisma.product.findMany` once in total (spy) and return deep-equal results.
- [ ] Calls differing only by `page` 1 vs 2 run the loader twice; `{q:'iphone', page:1}` and `{page:1, q:'iphone'}` share one entry.
- [ ] A `q` search stores the ranked page: stored `items.length <= 12` for the default limit (never the 500 candidates).
- [ ] An empty result is `set` with ttl 30.
- [ ] A cache-hit `live` listing request performs exactly 1 store GET and 0 Prisma calls; a miss performs 1 GET + 1 SET.
- [ ] A DRAFT product never appears: create DRAFT, call `listPublicProducts`, result excludes it.
- [ ] Every stored key matches `^gw:[a-z]+:cat:(list|search):v1:[0-9a-f]{40}$` (no user id possible); if the shell is built, `catalogService.updateBrand` success calls store `del` once with the shell key and a 409 does not.
- [ ] With env unset, `/category/phones?brand=apple`, `/products?q=x` return the same HTML body (ignoring build id) as before the change on identical seed data.
- [ ] Preview: Upstash commands per filtered view <= 2 on a hit; Prisma ops per filtered view <= 1 on a hit.

### Phase 6: Guest cart hydrate cache (N4, enable-on-trigger)
Scope: `src/server/cart/cart.service.ts` (`hydrateGuestCart`), new `src/server/cart/__tests__/cart-hydrate-cache.test.ts`.
Steps (test first): MGET `var:v1:<id>`, query only the misses with one `findMany`, SET each with TTL 30s, assemble lines with request quantities.
Acceptance criteria:
- [ ] Hydrating 3 variants twice within TTL runs `prisma.productVariant.findMany` once; second response deep-equals the first except quantities come from the request.
- [ ] Hydrating [A,B] then [B,C]: the second `findMany` has `where.id.in` equal to `['C']`.
- [ ] Stored JSON for a variant has no `quantity` field.
- [ ] Hydrate with an unknown variant id returns the other lines (200) and omits the unknown one.
- [ ] `git diff --stat` shows 0 changed lines under `src/server/checkout/**`.

### Phase 7: Cross-Validation (always last)
Steps: (1) `npm run typecheck && npm run lint && npm run test && npm run build`; (2) `ecc:verification-loop`; (3) end to end on a preview with Redis on, then with the env vars removed: home -> category -> filter -> search -> PDP -> guest add to cart -> login -> COD checkout -> admin edits product price -> storefront shows the new price; (4) reconcile every criterion above and the original goals; (5) one final `code-review` + `ecc:security-review`; (6) record measured ops, invocations and Redis commands per page view in Execution results and compare to 5.2.
Acceptance criteria:
- [ ] All four commands exit 0; test count increased; 0 failures; no new skipped tests.
- [ ] With Redis env removed on the preview, every flow completes with no 5xx, and the 11th bad login in 15 min returns the throttled error via the Postgres fallback.
- [ ] Production-like log export of one home -> category -> PDP session shows at most 6 function invocations (baseline ~20+).
- [ ] With Redis on, repeating one filtered URL 20 times gives Upstash commands <= 2 per request and Prisma ops <= 1 per request after the first; measured hit ratio >= 85% over the run.
- [ ] Place a COD order for the last unit while the PDP/listing still shows it in stock (ISR/Redis stale): checkout rejects the oversell with 409.
- [ ] Final review reports no unresolved high/critical findings; Upstash data browser shows no PII in any key or value.
- [ ] Execution results lists measured vs modeled Prisma ops, invocations and Redis commands per page view, and states whether the 85% hit-ratio metric was met.

---

## 9. Out of scope (deliberate)
- Editing `SCALE-UP-TODO.md` (owner declined).
- Client-side-fetch listing (CSR hybrid with path-based pagination): possible later upgrade if filter clicks need to feel instant; rewrite split chosen because it keeps server HTML and current UX.
- Trigram/GIN index and Postgres FTS; page-local price sort and `minPrice` dropped when `maxPrice` set (`catalog.service.ts:529-530`, `:654-666`); missing FK indexes; admin list pagination; analytics rewrite.
- Redis-backed ISR, `use cache`/`cacheComponents` migration, Prisma Accelerate (retiring); passing `session` into `SessionProvider` (would make the root layout dynamic).
- Per-user caches; Redis cache for reviews; stock-crossing-zero revalidation (stale `inStock` is safe, add-to-cart/quote/`placeOrder` re-read live stock).
- Adjacent correctness bugs found, NOT fixed here (own plans): payment callback read-then-write race and double restock (`payments.service.ts:112-198`), SUCCEEDED can resurrect a cancelled order (`:162-165`), coupon `usedCount` not released on most cancel paths (`orders.service.ts:56-79`), admin `updateProduct` absolute stock overwrite (`catalog.service.ts:401`), role-demotion staleness (F3), `RateLimitBucket` never swept (fallback table still grows).
- Shortcuts taken: no stampede lock (limit: in-flight dedupe is per instance; upgrade when one hot key shows >20 concurrent misses); filtered/search invalidation is TTL-only (limit: <=60-120s stale; upgrade with a version key if admins need instant search updates); fixed-window limiter (limit: up to 2x burst at window edges; upgrade login to sliding window if abused); no Redis usage dashboard (rely on Upstash console + budget alert; upgrade when command spend > $5/mo).
- Vercel Hobby to Pro decision.

## 10. Rollback
Runtime kill switch: remove `UPSTASH_REDIS_REST_*` in Vercel and redeploy; code falls back to DB paths with no behavior loss. Phase 2 rollback: remove the `rewrites()` block (the `live/*` twins become unreachable and the public routes revert to reading `searchParams` via a one-commit revert). Code rollback: `git revert` the phase commits, or `git switch main && git branch -D feature/redis-isr-caching`. No migrations; `RateLimitBucket` table retained. Phases 1-2 are independently safe to keep.

## 11. Owner actions (executor cannot do these)
1. Create the Upstash Redis DB in Singapore (ap-southeast-1), set env vars in Vercel prod + preview (only needed from Phase 7 onward).
2. Set Upstash budget cap and 80% alert.
3. Tell the executor the Prisma Postgres region and Vercel plan; run the Phase 0 controlled test (or let the executor read the dashboards with you).
4. Confirm the remote branch delete when the executor renames the branch.

## Execution results
(empty, filled by `supercharged-executor`)

## Execution Progress

**Status: code complete, deploy-only checks pending (see Final Status)**

_Last updated: 2026-10-12 — Branch: `feature/redis-implementation` (owner chose to keep the old name; rename step skipped) — Workspace: worktree at `.claude/worktrees/redis-isr`_

Setup notes: main checkout switched to `main` so the worktree could hold the branch; `.claude/worktrees/` excluded via `.git/info/exclude`; `.env*` copied into the worktree (gitignored, not committed); `npm ci` done. No push, no remote branch change. Plan doc committed as `8d62df3`.

| Phase | Status | Commit | Review | Notes |
| --- | --- | --- | --- | --- |
| 0. Baseline and measurement | partial (code side done, owner measurements pending) | `8d62df3` (plan) | deferred | owner TODO: Prisma ops delta per view, log invocation count, DB region, Vercel plan |
| 1. App fixes, no Redis | done | `5b19334` | deferred | agent: general-purpose (judgment-heavy, multi-file). Lint cannot run (pre-existing, see below). Deploy-only ACs carried to Cross-Validation |
| 2. ISR for listing pages (rewrite split) | done | `bd67a76` | deferred | agent: general-purpose. Deploy-only ACs carried to Cross-Validation |
| 3. Redis foundation | done | `d599009` | deferred | agent: general-purpose. `.env.example` is gitignored/untracked in this repo, so the new optional vars are documented in `src/env.ts` and CLAUDE.md only |
| 4. Rate-limit backend + hot limiters | done | `76f73af` | deferred | agent: general-purpose, ran in parallel with 5 and 6 (disjoint files). Warranty POST limiter lives in `src/app/api/orders/[id]/warranty/route.ts` (plan named a non-existent `api/warranty` POST) |
| 5. Dynamic listing cache | done | `fdc979e` | deferred | agent: general-purpose. Shell built now (not trigger-gated) |
| 6. Guest cart hydrate cache | done | `f782f7b` | deferred | agent: general-purpose |
| 7. Cross-Validation | done (code side); deploy-only checks open | `a89ee42` | 1 review pass, 3 Must + 4 Should fixed | see Cross-Validation section |

### Phase 0 — Baseline and measurement

- [x] AC1: route table from fresh build (`npm run build` in worktree, 2026-10-12). ISR (`initialRevalidateSeconds`): `/` 120, `/api/catalog/brands` 60, `/api/catalog/categories` 60, `/sitemap.xml` 3600. Static: `/about`, `/cart`, `/contact`, `/forgot-password`, `/login`, `/privacy-policy`, `/refund-policy`, `/reset-password`, `/robots.txt`, `/signup`, `/terms`, `/verify-email`, `/account/*`. Dynamic (ƒ): `/products`, `/products/[slug]`, `/category/[slug]`, `/brand/[slug]`, `/checkout`, `/orders/[id]`, `/dashboard/*`, `/api/catalog/products`, `/api/catalog/products/[slug]`, all other API routes; `prerender-manifest.dynamicRoutes` is `[]`. Matches the 2026-10-12 production log.
- [ ] AC2-AC6: owner-supplied measurements (home/PDP/category Prisma ops delta and invocation counts, "21% used" label, DB region, Vercel plan). Pending; Phases 1-2 are not blocked. Measurements are re-taken in Cross-Validation.
- Deviations: Phase 0 measurement ACs deferred by owner decision; baseline = production log 2026-10-12.

### Phase 1 — App fixes, no Redis

- [x] AC1: `next build` lists `/products/[slug]` as `● (SSG)`. Literal manifest wording not met: `dynamicRoutes['/products/[slug]']` exists (`fallback: null`) but has no `initialRevalidateSeconds` because no params are prerendered. ISR is real: local `next start`, first GET `x-nextjs-cache: MISS`, second `HIT`, `Cache-Control: s-maxage=120, stale-while-revalidate=31535880`.
- [ ] AC2 (`x-vercel-cache` HIT/STALE on a preview), AC3 (admin PUT then GET shows new name/price), AC5 (`/about` shows a new brand): deploy-only, NOT run; carried to Cross-Validation.
- [x] AC4 (slug a->b): unit test asserts helper called with `productSlug: bb, previousSlug: aa` (`src/app/api/__tests__/admin-revalidate.test.ts`). Real 404/200 check is deploy-only.
- [x] AC6: 409 from the service gives 0 helper calls (PUT, POST, DELETE) — same test file.
- [x] AC7: `/api/catalog/products?limit=1`, `/api/catalog/brands`, `/api/reviews` return the specified `Cache-Control` locally; header test in `cache-headers.test.ts`; `/api/cart` unauthenticated returns 401 with no Cache-Control; no other route handler sets Cache-Control (grep).
- [x] AC8: GET `/api/reviews` no longer calls `summaryForProduct`; SSR summary passed down as a `summary` prop.
- [x] AC9: `getCartSummary` with no cart returns zeros and never calls `upsert`; first `addItem` calls `upsert` once (`src/server/cart/__tests__/cart.service.test.ts`, mocked Prisma; concurrent first-add race not exercised).
- [x] AC10: signup 6th, forgot 6th, reset 11th call refused with no user/email; other IP unaffected (`src/modules/auth/__tests__/actions-rate-limit.test.ts`).
- [x] AC11: `q` 100 ok / 101 fails; hydrate 50 ok / 51 fails (`src/contracts/__tests__/input-caps.test.ts`); local POST `/api/cart/hydrate` with 51 lines returned 422.
- [x] AC12: `grep next/cache src` only `src/app/api/_lib/revalidate.ts`; `src/server` 0 matches. `npm run typecheck` clean; `npx vitest run` 20 files / 111 tests pass (baseline 15 / 95). `npm run lint` NOT run: pre-existing circular-config error in the ESLint setup (`next lint` removed in Next 16); not touched.
- Deviations (trivial, accepted): product PUT/DELETE do one extra `getProduct` lookup before writing (DELETE of a missing id now 404s from the lookup); review summary on the PDP now only refreshes with the 120s ISR window or an admin revalidate (a newly submitted review does not trigger revalidation); action limiters run before input validation, matching the REST routes.
- Carried to Cross-Validation: deploy-only ACs above, real `revalidatePath` effect, cart concurrent-first-add, lint tooling.

### Phase 2 — ISR for listing pages via a rewrite split

- [x] AC1: `npm run build` lists `/products` as `○` (revalidate 1m), `/category/[slug]` and `/brand/[slug]` as `●` (prerendered laptops, phones, accessories, apple, hoco, jisulife + others); `/live/products`, `/live/category/[slug]`, `/live/brand/[slug]` are `ƒ`. `prerender-manifest`: routes `/category/{phones,laptops,accessories}`, `/brand/{...}`, `/products` with `initialRevalidateSeconds` 60; `dynamicRoutes` has `/category/[slug]`, `/brand/[slug]` (`fallback: null`).
- [ ] AC2 (`x-vercel-cache` HIT, no function run in Vercel log), AC3-on-Vercel, home-load invocation count (<= 3), Prisma ops delta (<= 3): deploy-only, NOT run; carried to Cross-Validation. Local `next start` equivalent: repeated GET `/category/phones`, `/brand/apple`, `/products` return `x-nextjs-cache: HIT`.
- [x] AC3: `/category/phones?utm_source=fb&fbclid=1` returns 200 and HIT locally.
- [x] AC4: `/category/phones?brandSlug=apple` returns 200 (no redirect), 1 product link (`brandSlug=hoco` 0), canonical `http://localhost:3000/category/phones`. Note the UI's real URL keys are the schema names (`brandSlug`, `categorySlug`, ...), not `brand`/`category`; rules use the schema names. Vercel log function name `/live/category/[slug]` is deploy-only.
- [x] AC5: `?limit=1` shows `galaxy-s24-ultra`, `?limit=1&page=2` shows `iphone-15-pro` (only 2 products in the category, so paging proven with `limit=1`); `/products?q=iph` HTML has `<meta name="robots" content="noindex"`.
- [x] AC6: unit test `src/lib/__tests__/listing-rewrites.test.ts`: 27 rules (3 routes x 9 keys), `has` type query, live destinations; fails if a `productListQuerySchema` key is missing from `LISTING_FILTER_QUERY_KEYS` (ignore list empty and documented).
- [x] AC7: by code reading, `product-filters.tsx` pushes `?brandSlug=...` style URLs covered by the rules; pagination pushes `?page=N`; Suspense added around `ProductFilters`/`StorefrontPagination` (without it `useSearchParams` bails the static render). Real browser click-through NOT run.
- [x] AC8 (`revalidatePath`): helper extended to `/products`, `/category/[slug]`, `/brand/[slug]`; `revalidate-helper.test.ts` asserts the calls. Real effect deploy-only.
- [x] AC11: `/sitemap.xml` code untouched; `npm run typecheck` clean; `npx vitest run` 22 files / 116 tests pass; `npm run build` succeeds. `npm run lint` still broken (pre-existing).
- Deviations (accepted, to surface to owner): live twins are ALWAYS `noindex` (plan said only `?q=` pages); filtered/paged views therefore never indexed (they already canonicalize to the base path, products stay discoverable via sitemap). Live twins emit 4 JSON-LD scripts vs 3 on base (not investigated; check in Cross-Validation). Pre-existing: `CommonListPage` is passed `brand={category}` on category pages, hiding the Brand filter (left as is).
- Carried to Cross-Validation: deploy-only ACs, real browser filter click-through, JSON-LD 3 vs 4, sitemap/robots not listing `/live`.

### Phase 3 — Redis foundation

- [x] All unit ACs pass (`src/server/common/__tests__/cache.test.ts`, 15 tests, written first): no store -> loader once per call and no throw; memoryStore dedupe + TTL expiry; failing `get` fails open, 6th call skips the store until 30s later (breaker); 10 concurrent cold calls run the loader once; 100KB+1 payload returned without `set`; `stableHash` key-order-insensitive; `buildKey` prefixes `gw:production:` / `gw:preview:`; `memoryStore.incrWindow` counts 1,2,3 then resets; 400ms timeout on a hung `upstashStore.get`; `upstashStore.incrWindow` is a single `eval`.
- [x] `@upstash/redis` 1.39.0 added (only new dependency); `eval(script, keys[], args)` signature confirmed from installed types. `npm run typecheck` clean, `npx vitest run` 23 files / 131 tests, `npm run build` succeeds with the Upstash vars unset.
- [x] CLAUDE.md updated (two lines): Redis is an optional fail-open layer; rate limiter keeps the Postgres fallback.
- Deviation: `.env.example` is gitignored (`.env*`) and untracked, so its new optional entries are not committed. Not run: real Upstash, lint (broken).

### Phase 4 — Rate-limit backend on Redis + limiters

- [x] `rateLimit` uses `withStore(s => s.incrWindow(buildKey('rl', sha256(key)[0:32]), windowMs))`; store absent/failing -> existing Postgres path (default) or fail-open (`fallback: 'none'`). Tests (`rate-limit.redis.test.ts`, 7; `route-rate-limits.test.ts`, 6): 4 calls max 3 -> true,true,true,false, remaining 2,1,0,0, window refill after 30001 ms; no `@` or raw IP in the Redis key; `clearRateLimit` resets both paths; rejecting store falls back to Postgres and still blocks the 4th call; `'none'` never throws or blocks.
- [x] Routes: 61st hydrate/min/IP, 121st `?q=` catalog/min/IP, 31st quote/min/user, 11th review/h/user, 6th warranty/h/user return 429 with numeric `Retry-After` where applicable; `?limit=8` without `q` never touches the limiter; other IP/user unaffected. No diff in `api/auth/*`, `api/checkout/route.ts`, `authOptions.ts`, `modules/auth/actions.ts`; existing `rate-limit.test.ts` passes unchanged.
- Deviations (accepted): (1) hydrate and catalog `?q=` limiters fail open when Redis is absent/failing (`fallback: 'none'`) so the Postgres limiter does not add 2-3 DB ops to the hottest public paths; their cost stays bounded by the Phase 1 caps. This relaxes the plan's "never disables protection" rule for those two endpoints only. (2) the warranty POST is `src/app/api/orders/[id]/warranty/route.ts`; the plan's `api/warranty` has only GET. Note: the existing REST limiter call sites also use Redis when configured (same `rateLimit` function).
- Not run: real Vercel `x-forwarded-for` behavior (Vercel sets it at the edge), real Upstash, lint.

### Phase 5 — Dynamic listing cache

- [x] `listPublicProducts` cached by canonical-query hash (`gw:<env>:cat:(list|search):v1:<sha1>`), TTL 60s, 120s with `q`, 30s for empty results; stores the ranked page DTO only (<= 12 items from a 500-row candidate set); invalid query is not cached. Tests (`catalog-cache.test.ts`) assert: identical queries run `findMany` once; hit = 1 GET + 0 Prisma, miss = 1 GET + 1 SET; page 1 vs 2 separate; `q` key-order/case/whitespace share one entry; PUBLISHED-only `where` on both branches; key shapes; shell second call = 0 Prisma calls.
- [x] `getCatalogShell()` (`gw:<env>:cat:shell:v1`, 300s) feeds the layout menu and listing sidebars; the six brand/category mutations `cacheDel` it after success, a P2002 conflict does not.
- [x] No store configured: loader runs directly (existing catalog tests pass). Full suite after the phase: 27 files / 169 tests pass; `npm run typecheck` clean.
- Deviations (accepted): shell built now rather than trigger-gated (no-op with Redis unset; needed for the 2-GET/0-Prisma hit criterion, so a filtered live-page hit is 2 GETs + 0 Prisma, not the plan's 1 GET); `cached()` gained an additive optional `ttlFor`; whitespace-only `q` is now treated as no query (previously searched for whitespace). Shell is invalidated only by brand/category mutations (<=300s stale otherwise).
- Not run (deploy-only): Upstash commands per filtered view <= 2 and Prisma ops per view on a preview.

### Phase 6 — Guest cart hydrate cache

- [x] `hydrateGuestCart` MGETs `gw:<env>:var:v1:<id>`, runs one `findMany` for missing ids only, stores each variant display DTO (11 keys, no `quantity`, TTL 30s); no store or any store failure runs the previous single query. Tests (`cart-hydrate-cache.test.ts`, 7): 3 variants twice -> one `findMany`, second response differs only by request quantities; [A,B] then [B,C] -> second `where.id.in` is `['C']`; unknown id omitted; store failure falls back; inactive/unpublished variants return `isActive: false`, also on the cached call. `src/server/checkout` diff empty.
- Note: a formatter run by an editor hook reformatted unrelated lines in `cart.service.ts` and its test after the phase commit; that churn was stashed (`stash@{0}: exec-cart-format-churn`) and not committed.

### Phase 7 — Cross-Validation

- Evidence (final tree, `a89ee42`): `npx tsc --noEmit` clean; `npx vitest run` 29 files / 185 tests pass (baseline before the branch: 15 / 95); `npm run build` succeeds, `/products` `○` 1m, `/category/[slug]` and `/brand/[slug]` `●` 1m, `/products/[slug]` `●`, `/live/*` `ƒ`; build no longer logs Redis timeouts or the dynamic-server-usage error; `next/cache` imported only by `src/app/api/_lib/revalidate.ts`; `src/server/checkout` has zero diff.
- Local production run against the real Upstash instance (read-only requests, prefix `gw:local:` via `VERCEL_ENV=local`): `/category/phones?brandSlug=apple` 0.93 s then 0.18 s, `/products?q=iph` 0.61 s then 0.11 s (Redis hits), `?utm_source=fb&fbclid=1` 0.25 s (ISR route); live twins carry `noindex` + base-path canonical; search limiter returned the first 429 on the 121st `?q=` request from one IP with `Retry-After`, requests without `q` never limited; hydrate with 51 lines returned 422. Redis SCAN of `gw:*`: 8 keys, all with TTLs, key shapes as designed, no `@`, IP, or `passwordHash` in any key or value.
- Review (one read-only pass over `git diff 65bce8b..HEAD`) findings, all fixed in `a89ee42`:
  - Must: (1) `buildKey` env prefix shared `gw:production:` between a local build/start and Vercel production -> now `gw:local:` unless `VERCEL_ENV`, and the store is skipped during `next build`; (2) review POST left the PDP and reviews list stale (new `s-maxage=60`) -> PDP revalidated best-effort after a successful submit, `GET /api/reviews` `s-maxage=10`; (3) a 101+ char `q` or `page=abc` threw a 500 on the live pages -> `safeParse` fallback to the default list, header input `maxLength=100`.
  - Should: (4) every product edit purged the whole layout -> `menu: true` only for brand/category writes; (5) hydrate limit raised to 120/min/IP (CGNAT) and shortcut comments completed; (6) live twins are now `noindex` only for search or direct `/live` access (plan wording restored); (7) `variantId` capped at 64 chars.
  - Nice: `publishedSlugs` logs a warning, `v1` bump comments added, `/api/catalog/products` uses `force-dynamic` (build error log gone), exact `UPSTASH_REDIS_REST_*` names documented in CLAUDE.md.
- Gaps vs requirements: none open in code. Documented shortcuts missing from section 9 are recorded here: hot public limiters (hydrate, catalog `q`) fail open when Redis is absent/failing; catalog shell built now, not trigger-gated, invalidated only by brand/category writes (<=300 s stale otherwise); cache/breaker state is per instance; `RateLimitBucket` still not swept.
- Deploy-only acceptance criteria NOT run (need a Vercel preview/production): `x-vercel-cache` HIT/STALE for PDP, `/category/*`, `/brand/*`, `/products`; Vercel log function name `/live/category/[slug]` for filtered URLs; at-most-3 function invocations for a second home load and at-most-6 for a home -> category -> PDP session; Prisma ops deltas (Phase 0 owner measurements also still pending); admin price edit shows immediately; `/about` shows a new brand; 85% hit-ratio and Upstash commands per filtered view <= 2; Redis-removed flow on a preview; real browser filter click-through; Vercel `rewrites()` `has` query matching; `x-forwarded-for` overwrite (Vercel does this at its edge).
- Other not-run: `npm run lint` (pre-existing broken ESLint config under Next 16, untouched); concurrent first add-to-cart race (mocked Prisma only).

## Final Status

**Status: code complete on `feature/redis-implementation` (HEAD `a89ee42`), ready for PR into `dev` after the deploy-only checks above.** Not pushed. Phases 1-2 (no Redis) deliver the main saving; Phases 3-6 add the optional fail-open Redis layer, which stays off until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in Vercel.

Commits: `5b19334` (pdp isr, revalidation, caps, auth limiters), `bd67a76` (isr listing pages via live rewrite split), `d599009` (redis foundation), `f782f7b` (guest hydrate cache), `76f73af` (redis rate limiter + limiters), `fdc979e` (listing cache + shell), `a89ee42` (cross-validation fixes).

Owner follow-ups: (1) deploy a Vercel preview and run the deploy-only checks, then do the Phase 0 measurements (Prisma ops per home/category/PDP view, invocation count from the log); (2) set the Upstash env vars in Vercel production/preview only after (1), with a budget cap and 80% alert; (3) decide on PR target `dev`; (4) `stash@{0}: exec-cart-format-churn` is a formatter-only stash created by this run (safe to drop; the executor does not run `stash drop`); (5) Vercel Hobby non-commercial / 1M invocation cap remains your decision.
