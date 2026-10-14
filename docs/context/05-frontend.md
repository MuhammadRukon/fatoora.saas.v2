# Frontend

## Route groups

- `src/app/(public)`: landing page (`/`, links to Login and Sign up) and the auth pages `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` (client components with server actions). The layout is a plain centered `<main>`.
- `src/app/(dashboard)`: admin, wrapped by a sidebar layout that server-checks `role === 'ADMIN'`.
- `src/app/(app)`: the user area. Its layout server-checks `role === 'USER'` (admins go to `/dashboard`). `/plans` (four plan cards, request via `useRequestPlan`; pending/active banners) is open to any USER; `app/layout.tsx` redirects every `/app/**` page to `/plans` unless the subscription state is ACTIVE.
- `/` redirects a signed-in user by role (ADMIN → `/dashboard`, USER → `/app`), which is also the post-login landing.
- Shared error surfaces: `error.tsx`, `global-error.tsx`, `not-found.tsx`. No `loading.tsx` yet.

## Admin pages (`/dashboard/*`)

- `/dashboard`: counts of USER accounts, PENDING requests and users with an ACTIVE subscription.
- `/dashboard/users`: user table with subscription state, latest plan, requested-at and active-until columns, and an Activate button (confirm dialog) on rows with a pending request (`src/modules/admin/users/hooks.ts`), via the shared `src/components/data-table.tsx` (client-side pagination). Avatars are initials only.

Sidebar: `src/components/dashboard-sidebar.tsx` (`navMain` = Dashboard, Users).

## Module structure (`src/modules/<domain>`)

Each domain has `hooks.ts` (React Query wrappers over `src/lib/fetcher.ts`) and `components/`:

- `auth/`: server actions (`actions.ts`: signup, verify, resend, forgot, reset, change-password, logout), auth-card, google-button.
- `admin/users/`: `useAdminUsers`, `useActivateSubscription`.
- `business/`: `useBusiness`, `useSaveBusiness`; `customers/`: `useCustomers`, `useCustomer`, `useSaveCustomer`, `useDeleteCustomer`. `/app/*` uses `AppSidebar`; pages outside `/app/business` sit in `(with-business)/` and redirect to `/app/business?setup=1` without a business.
- `zatca/`: `useZatcaStatus`, `useOnboard`, `ZatcaPanel` (page `/app/zatca`: environment badge, OTP form, error list, compliance results table, expiry banner under 30 days).
- `subscriptions/`: `useSubscriptionState`, `useRequestPlan`.

## State management

- **Server state**: TanStack Query, keys centralized in `src/constants/queryKeys.ts`. Defaults: `staleTime 30s`, `retry 1`, no refetch on focus.
- **Session**: `useSession` client-side; `auth()` only in server layouts/pages that need it (dashboard layout). `SessionProvider` mounts with `session={null}` (no `/api/auth/session` request) except on `/login`; a returning user is detected by a localStorage boolean (`fatoora.authHint`, `src/lib/auth-hint.ts`; also set on the OAuth return `?auth=1`) that makes `AuthHintSync` in `src/components/providers.tsx` fetch the session once. The hint never authorizes anything. A page that needs the session on first paint must be added to `SESSION_PATHS` in `src/components/providers.tsx`.
- Providers stack in `src/components/providers.tsx`: Session → Theme (next-themes) → QueryClient → AuthHintSync → Toaster.

## Rendering conventions

- Fonts via `next/font/local`: three subsetted Google Sans woff2 files (400/500/600) in `src/app/fonts`, `display: 'swap'`; Bold and Italic are not shipped, so avoid `font-bold` and `italic`.
- Shared components live in `src/components` (`ui/*` are shadcn primitives).
