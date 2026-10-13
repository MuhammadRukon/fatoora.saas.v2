# Scale-Up TODO — When the Project Is Successful

A staged checklist of infrastructure, tooling, and features to adopt **as revenue and traffic justify the cost**. Complements [FEATURE-GAPS.md](./FEATURE-GAPS.md) (which covers what's needed *now*). Don't build ahead of need — each stage has a trigger.

Current baseline: Vercel free tier, Prisma-hosted Postgres, Cloudinary free tier, Resend email, optional Upstash Redis (cache and limiter); no queue or monitoring.

---

## Stage 1 — First real traffic (~hundreds of orders/month)

Trigger: consistent daily orders, or free-tier limits start pinching.

### Infra & reliability
- [ ] **Error tracking** — Sentry (free tier exists). You currently have no visibility into production errors beyond Vercel logs.
- [ ] **Uptime monitoring** — Better Stack / UptimeRobot free tier + fix the health endpoint to ping the DB (`SELECT 1`).
- [ ] **DB backups verified** — confirm Prisma Postgres backup/restore story; script a weekly `pg_dump` to object storage as belt-and-braces.
- [ ] **Staging environment** — Vercel preview deploys already exist; add a separate staging DB + seed so `dev` branch doesn't test against production data.
- [ ] **Vercel spend guard** — set a hard spending limit before upgrading to Pro so a traffic spike can't surprise-bill you.

### Caching (cheap wins first)
- [x] **Tune ISR/`revalidate`** — done: listings 60 s, home/PDP 120 s, on-demand purge on admin writes, filtered listings on dynamic `/live/*` twins (see [02-architecture.md](../context/02-architecture.md#caching--isr)).
- [x] **`Cache-Control` headers on public API routes** (`/api/catalog/*`) — done (`src/app/api/_lib/cache-control.ts`).
- [ ] **Upstash Redis (free tier)** — rate limiting, catalog/list cache and guest-cart display cache are done (optional, fail-open). Remaining: coupon counters, measure real command usage, set the budget cap and 80% alert.

### Email/SMS (if not already done from FEATURE-GAPS P0)
- [x] Transactional email via Resend — done. [ ] A BD SMS gateway (e.g. BulkSMS BD, Alpha SMS) for order updates — SMS converts better than email locally.

### Analytics
- [ ] **Product analytics** — PostHog (generous free tier) or GA4: funnels (view → cart → checkout → paid), search terms with zero results, abandonment points. Vercel Analytics only gives you page views.

---

## Stage 2 — Growing store (~1–5k orders/month, paid plans justified)

Trigger: free tiers exhausted, or ops pain is costing real time/money.

### Infra
- [ ] **Vercel Pro** — more function duration/invocations, cron jobs, password-protected previews.
- [ ] **Connection pooling** — Prisma Accelerate or PgBouncer; serverless + Postgres connection exhaustion appears around this scale.
- [ ] **Background job runner** — Inngest or Trigger.dev (both have free tiers, both work on Vercel): order-expiry sweeps, email sequences, low-stock digests, report generation. Replaces "lazy sweeps inside request handlers".
- [ ] **Structured log drain** — ship Vercel logs to Axiom/Better Stack for searchable history beyond the retention window.

### Database
- [ ] **Query review** — fix the known offenders first (analytics in-memory aggregation, admin lists without pagination — see [KNOWN-ISSUES](../KNOWN-ISSUES.md#architecture)), then add missing indexes based on `pg_stat_statements`.
- [ ] **Full-text / faceted search** — Postgres `tsvector` first (free, good for ~10k SKUs); jump to Meilisearch/Typesense (self-host or cloud) when you need typo tolerance, facets, and merchandising. Skip Algolia unless margins are fat.
- [ ] **Read scaling** — only if dashboards/analytics start hurting checkout latency: read replica or move analytics to nightly materialized views.

### Media
- [ ] **Cloudinary plan review** — you'll hit the free 25 credits with real catalog + traffic. Alternatives at scale: Cloudflare Images or S3/R2 + `next/image` optimization, which is dramatically cheaper per GB.
- [ ] **Media hygiene** — orphan sweep for Cloudinary assets (the uploader already leaks — see [KNOWN-ISSUES](../KNOWN-ISSUES.md#frontend)), image variant policy (upload once, transform on delivery), enforce max dimensions.
- [ ] **Product video support** — short demo clips on PDP measurably lift gadget conversion.

### Features (growth levers)
- [ ] Abandoned-cart recovery (email/SMS sequence — needs job runner).
- [ ] Wishlist + back-in-stock notifications.
- [ ] Related/recommended products (start rule-based: same category + price band; ML later).
- [ ] Review request emails post-delivery (drives the aggregateRating SEO flywheel).
- [ ] Coupon/campaign analytics; first-purchase and referral codes.
- [ ] Courier API integration (Pathao/RedX/Steadfast) — auto-create shipments, sync tracking.
- [ ] Invoice PDF generation (customers and VAT compliance both want it).
- [ ] Customer support tooling — shared inbox (Chatwoot self-hosted is free) or WhatsApp Business, which BD customers expect.

### Security
- [ ] 2FA for admin accounts (TOTP).
- [ ] Cloudflare in front (free plan): WAF rules, bot fight mode, DDoS absorption — also gives you a second CDN layer and cache rules.
- [ ] Dependency audit automation (Dependabot/Renovate) + a periodic `npm audit` gate in CI.

### Engineering process
- [ ] **CI pipeline** — GitHub Actions: lint + typecheck + tests + build on every PR (currently nothing enforces this).
- [ ] **E2E smoke tests** — Playwright over the money path: browse → add to cart → checkout (sandbox payment) → order visible. Run in CI on `dev → main` PRs.
- [ ] Service-layer test coverage for checkout/payments (the race-condition zone — see [KNOWN-ISSUES](../KNOWN-ISSUES.md#correctness)).

---

## Stage 3 — Established business (10k+ orders/month, small team)

Trigger: hiring staff, multiple people in the admin, real money at stake.

### Infra & architecture
- [ ] **Extract heavy workloads** — analytics/reporting to a separate service or warehouse (BigQuery/ClickHouse free tiers go far); keep the storefront lean.
- [ ] **Queue-based order pipeline** — payment webhooks → queue → workers (idempotent), so gateway retries and traffic spikes never drop orders.
- [ ] **Multi-region/CDN strategy** — Vercel Edge caching for the catalog; consider a dedicated region close to BD users (Singapore) for functions.
- [ ] Evaluate whether Next.js API routes still fit, or whether `src/server/**` graduates to a standalone API (NestJS/Fastify) — the layering was designed for this migration.
- [ ] Infrastructure-as-code (even just documented Vercel/DNS/env config) + secrets manager (Doppler/1Password).

### Data & ML
- [ ] Recommendation engine on real behavioral data (PostHog/warehouse events).
- [ ] Demand forecasting for inventory purchasing.
- [ ] Fraud signals for COD (repeat-refuser detection, phone/address blocklists) — COD refusal is the #1 margin killer in BD e-commerce.

### Team & ops features
- [ ] Staff roles/permissions (ORDER_MANAGER, CATALOG_EDITOR…) — replaces the single ADMIN role ([KNOWN-ISSUES](../KNOWN-ISSUES.md#architecture)).
- [ ] Full audit log across all admin mutations.
- [ ] Inventory ledger (stock movements with reasons: sale, return, damage, purchase) + multi-warehouse if applicable.
- [ ] Supplier/purchase-order module (buying price already exists per variant — extend it).
- [ ] Accounting export (Tally/QuickBooks/CSV) + VAT reporting.
- [ ] Returns/RMA portal with barcode-able return labels.

### Customer experience
- [ ] Bangla localization (next-intl) + BDT formatting everywhere.
- [ ] Loyalty points / store credit.
- [ ] PWA with offline catalog browsing; push notifications for order updates.
- [ ] Live chat with agent handoff.
- [ ] Marketplace channels — sync catalog to Facebook Shops / Daraz if channel expansion makes sense.

---

## Deliberately deferred (revisit only with strong evidence)

- **Microservices / Kubernetes** — the monolith with clean layering will carry you very far; don't split before Stage 3 pain is real.
- **GraphQL** — REST + Zod contracts are working; switching buys little here.
- **Elasticsearch** — Meilisearch/Typesense covers e-commerce search at a fraction of the ops cost.
- **Custom mobile app** — PWA first; app only when retention data demands it.
- **Headless CMS** — static pages + a simple banners table beat a CMS subscription until content velocity is high.

## How to use this list

Work top-down within the current stage only. Before adopting anything paid, check: (1) is a free tier enough? (2) does the monthly cost stay under ~1% of monthly revenue? (3) does it remove a manual task someone actually does weekly? If not all three, defer.
