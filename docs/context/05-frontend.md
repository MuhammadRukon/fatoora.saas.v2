# Frontend

## Route groups

- `src/app/(public)`: landing page (`/`, links to Login and Sign up) and the auth pages `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password` (client components with server actions). The layout is a plain centered `<main>`.
- `src/app/(dashboard)`: admin, wrapped by a sidebar layout that server-checks `role === 'ADMIN'`.
- Shared error surfaces: `error.tsx`, `global-error.tsx`, `not-found.tsx`. No `loading.tsx` yet.

## Admin pages (`/dashboard/*`)

- `/dashboard`: overview placeholder (user and subscription counts land in plan Phase 2).
- `/dashboard/users`: user table with create/edit dialog (`src/modules/admin/users/hooks.ts`), via the shared `src/components/data-table.tsx` (client-side pagination/filtering).

Sidebar: `src/components/dashboard-sidebar.tsx` (`navMain` = Dashboard, Users).

## Module structure (`src/modules/<domain>`)

Each domain has `hooks.ts` (React Query wrappers over `src/lib/fetcher.ts`) and `components/`:

- `auth/`: server actions (`actions.ts`: signup, verify, resend, forgot, reset, change-password, logout), auth-card, google-button.
- `admin/users/`: `useAdminUsers`, `useAdminUserMutations`.

## State management

- **Server state**: TanStack Query, keys centralized in `src/constants/queryKeys.ts`. Defaults: `staleTime 30s`, `retry 1`, no refetch on focus.
- **Session**: `useSession` client-side; `auth()` only in server layouts/pages that need it (dashboard layout). `SessionProvider` mounts with `session={null}` (no `/api/auth/session` request) except on `/login`; a returning user is detected by a localStorage boolean (`fatoora.authHint`, `src/lib/auth-hint.ts`; also set on the OAuth return `?auth=1`) that makes `AuthHintSync` in `src/components/providers.tsx` fetch the session once. The hint never authorizes anything. A page that needs the session on first paint must be added to `SESSION_PATHS` in `src/components/providers.tsx`.
- Providers stack in `src/components/providers.tsx`: Session → Theme (next-themes) → QueryClient → AuthHintSync → Toaster.

## Rendering conventions

- Fonts via `next/font/local`: three subsetted Google Sans woff2 files (400/500/600) in `src/app/fonts`, `display: 'swap'`; Bold and Italic are not shipped, so avoid `font-bold` and `italic`.
- Shared components live in `src/components` (`ui/*` are shadcn primitives).
