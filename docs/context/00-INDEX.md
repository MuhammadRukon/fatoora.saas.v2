# Documentation Index

Fast orientation for AI assistants and human contributors. Read `01-overview.md` first; the rest are reference.

## Context (this folder)

| File | What it covers |
| --- | --- |
| [01-overview.md](./01-overview.md) | What the project is, tech stack, hosting constraints, environment variables |
| [02-architecture.md](./02-architecture.md) | Layers, request flow, auth/RBAC, rate limiting, optional Redis layer, testing |
| [03-data-model.md](./03-data-model.md) | Prisma schema: entities, enums, money handling |
| [04-api-reference.md](./04-api-reference.md) | Every API route, its auth level, and what it does |
| [05-frontend.md](./05-frontend.md) | Page inventory, module structure, state management |
| [06-conventions.md](./06-conventions.md) | How to add a feature, contracts-first workflow, query keys, testing, git flow |
| [07-zatca-onboarding.md](./07-zatca-onboarding.md) | EGS onboarding flow, encrypted credentials, and how to run the Simulation gate (`npm run zatca:sim-check`) |

## Other docs

| Location | What it covers |
| --- | --- |
| [../KNOWN-ISSUES.md](../KNOWN-ISSUES.md) | Verified-open issues, each with a code location |
| [../plans/](../plans/) | Active plan: `fatoora-saas-v2-plan.md` (phased build of the ZATCA SaaS) |
| [../../README.md](../../README.md) | Repo README: setup, scripts, high-level summary |

## Quick facts

- **Product**: "Fatoora", a multi-tenant ZATCA Phase 2 e-invoicing SaaS for Saudi businesses. Users sign up, request a plan (no payment), an admin activates it, then they issue invoices and credit/debit notes reported to or cleared by ZATCA. Phases 1-7 are built and merged: auth, plan requests and admin activation, business and customers, document drafts, ZATCA onboarding and the issuance pipeline (sign, chain, report or clear, retry). The live ZATCA Simulation gate (AC6.4/AC7.11) is still pending.
- **Stack**: Next.js 16 (App Router, Turbopack dev) + React 19 + TypeScript, Prisma + PostgreSQL, Auth.js v5 (JWT), TanStack Query, Tailwind v4 + shadcn/ui, Vitest.
- **Hosting**: Vercel (frontend + API), Prisma-hosted Postgres, optional Upstash Redis (limiter, fail-open). Cost-sensitive: prefer DB-based or free-tier solutions.
- **Roles**: `USER` and `ADMIN` only.
- **Money**: integer halalas (1 SAR = 100 halalas) everywhere; never floats.
