# API Reference

All routes live under `src/app/api/**`. Auth levels: **public**, **user** (`requireUserSession`: role USER, 403 for an admin), **app** (`requireAppSession`: USER with an ACTIVE subscription, else 402 `SUBSCRIPTION_REQUIRED`), **admin** (`requireAdminSession`). Bodies are validated with Zod contracts from `src/contracts/**`. Rate-limited routes return 429 + `Retry-After`.

## Auth

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | public | Auth.js handlers |
| `/api/auth/signup` | POST | public | rate-limited (5 / 15 min / IP); bcrypt hash; creates `role: USER` |
| `/api/auth/forgot` | POST | public | rate-limited (5 / h / IP); no email enumeration; outside production the response also carries `devResetUrl` |
| `/api/auth/reset` | POST | public | rate-limited (10 / h / IP); single-use hashed token |

Signup, email verification (verify code, resend), forgot/reset and change-password also run as server actions in `src/modules/auth/actions.ts`; all are rate-limited.

## Subscriptions

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/subscriptions` | POST | user | `{plan}` → 201 PENDING subscription; 409 `SUBSCRIPTION_PENDING` while one is open; 422 on an unknown plan |
| `/api/subscriptions/me` | GET | user | `{state: NONE\|PENDING\|ACTIVE\|EXPIRED, activeUntil, pending}` |
| `/api/app/ping` | GET | app | gate fixture: `{ok:true}`; every future `/api/app/**` route uses `requireAppSession()` |

## App (user, active subscription, 402 otherwise)

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/app/business` | GET, PUT | app | GET returns the profile or `null`; PUT creates the first time, then updates; 422 on field errors; 409 `BUSINESS_LOCKED_FIELDS` |
| `/api/app/customers` | GET, POST | app + business | GET `?q=&cursor=&limit=` cursor page; POST 201; 409 `BUSINESS_REQUIRED` before a business exists |
| `/api/app/customers/[id]` | GET, PATCH, DELETE | app + business | another business's id is 404; DELETE 204; 409 `CUSTOMER_HAS_DOCUMENTS` once documents reference it |

## Admin

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/admin/users` | GET | admin | list users (newest first) with `subscriptions` (latest 5) and computed `subscriptionState`; no create/edit (admins are seed-created) |
| `/api/admin/subscriptions/[id]/activate` | POST | admin | activate a PENDING request under a row lock → 200; 409 `SUBSCRIPTION_NOT_PENDING`; 404 unknown id |

A non-admin token gets 401 from the edge guard (`src/proxy.ts`) before the route runs; the route itself answers 401 (no session) or 403 (not admin).

## Misc

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/health` | GET | public | returns `{message:'OK'}`; no DB ping |
