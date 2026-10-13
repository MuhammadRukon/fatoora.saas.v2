# Documentation Index

Fast orientation for AI assistants and human contributors. Read `01-overview.md` first; the rest are reference.

## Context (this folder)

| File | What it covers |
| --- | --- |
| [01-overview.md](./01-overview.md) | What the project is, tech stack, hosting constraints, environment variables |
| [02-architecture.md](./02-architecture.md) | Layers, request flow, auth/RBAC, payment provider strategy, cart, checkout, rate limiting, caching/ISR |
| [03-data-model.md](./03-data-model.md) | Prisma schema: entities, enums, relations, money handling |
| [04-api-reference.md](./04-api-reference.md) | Every API route, its auth level, and what it does |
| [05-frontend.md](./05-frontend.md) | Page inventory (storefront + admin), module structure, state management, rendering strategy |
| [06-conventions.md](./06-conventions.md) | How to add a feature, contracts-first workflow, query keys, testing, git flow |

## Other docs

| Location | What it covers |
| --- | --- |
| [../KNOWN-ISSUES.md](../KNOWN-ISSUES.md) | **Known issues** — verified-open security, correctness, architecture, frontend and tooling items, each with a code location |
| [../product/FEATURE-GAPS.md](../product/FEATURE-GAPS.md) | Features still needed to make the shop functional for users and admins, prioritized |
| [../product/SCALE-UP-TODO.md](../product/SCALE-UP-TODO.md) | Staged future roadmap for when the project is successful — caching, Redis, infra, media, growth features |
| [../SEO-AUDIT.md](../SEO-AUDIT.md) | SEO current state and the remaining open items |
| [../plans/](../plans/) | Active plans: Playwright E2E, Redis/ISR follow-ups, perf and docs cleanup |
| [../../README.md](../../README.md) | Repo README: setup, scripts, high-level summary |

## Quick facts

- **Product**: "Cryptech" — gadget/electronics e-commerce for the Bangladesh market (BDT, bKash/SSLCommerz/COD/bank transfer, Dhaka-based shipping rules).
- **Stack**: Next.js 16 (App Router, Turbopack dev) + React 19 + TypeScript, Prisma + PostgreSQL, Auth.js v5 (JWT), TanStack Query + Zustand, Tailwind v4 + shadcn/ui, Cloudinary media, Vitest.
- **Hosting**: Vercel free tier (frontend + API), Prisma-hosted Postgres, optional Upstash Redis (cache + limiter, fail-open). Cost-sensitive: avoid paid infra; prefer DB-based or free-tier solutions.
- **Roles**: `CUSTOMER` and `ADMIN` only.
- **Money**: integer cents (BDT paisa) everywhere; never floats.
- **Status**: MVP, deployed from `main` only.
