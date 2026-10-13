# API Reference

All routes live under `src/app/api/**`. Auth levels: **public**, **user** (`requireSession`), **admin** (`requireAdminSession`). Bodies are validated with Zod contracts from `src/contracts/**`. Rate-limited routes return 429 + `Retry-After`.

## Auth

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/auth/[...nextauth]` | GET/POST | public | Auth.js handlers |
| `/api/auth/signup` | POST | public | rate-limited (5 / 15 min / IP); bcrypt hash; creates `role: USER` |
| `/api/auth/forgot` | POST | public | rate-limited (5 / h / IP); no email enumeration; outside production the response also carries `devResetUrl` |
| `/api/auth/reset` | POST | public | rate-limited (10 / h / IP); single-use hashed token |

Signup, email verification (verify code, resend), forgot/reset and change-password also run as server actions in `src/modules/auth/actions.ts`; all are rate-limited.

## Admin

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/admin/users` | GET/POST | admin | list users (newest first) / create a user with a role |
| `/api/admin/users/[id]` | PUT | admin | edit name, phone, image, role; no delete |

A non-admin token gets 401 from the edge guard (`src/proxy.ts`) before the route runs; the route itself answers 401 (no session) or 403 (not admin).

## Misc

| Route | Methods | Auth | Notes |
| --- | --- | --- | --- |
| `/api/health` | GET | public | returns `{message:'OK'}`; no DB ping |
