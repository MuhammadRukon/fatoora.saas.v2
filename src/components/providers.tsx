'use client';

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { SessionProvider, useSession } from 'next-auth/react';
import { Toaster } from '@/components/ui/sonner';
import { readAuthHint, setAuthHint } from '@/lib/auth-hint';
import { makeQueryClient } from '@/lib/queryClient';
import { useGuestCartMerge } from '@/modules/cart/hooks';

/**
 * Mounts the one-time effect that merges any persisted guest cart
 * into the server cart immediately after sign-in. Lives here so no
 * individual cart consumer (page, panel, header) has to remember to
 * mount it themselves.
 */
function CartBootstrap(): null {
  useGuestCartMerge();
  return null;
}

// Pages that need the session on first paint: always the normal mount fetch.
const SESSION_PATHS = /^\/(login|account|orders|checkout)(\/|$)/;

/**
 * SessionProvider mounts with `session={null}` (no request) unless the page needs
 * the session, so a returning user (auth hint) or an OAuth return (`?auth=1`)
 * asks for it here. Layout effect: status flips to loading before the first
 * paint, so no "Login" flash. `session` is only read at mount, so the hint is
 * handled here instead of in the prop (the server cannot see it: hydration).
 */
export function AuthHintSync(): null {
  const { status, update } = useSession();

  useLayoutEffect(() => {
    const url = new URL(window.location.href);
    const landing = url.searchParams.get('auth') === '1';
    if (landing) {
      url.searchParams.delete('auth');
      window.history.replaceState(window.history.state, '', url);
    }
    if (status !== 'loading' && (landing || readAuthHint())) void update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // Set only: a null session also means a transient network/5xx error (next-auth swallows it).
  // A forged hint is cleared by the 401 of the cart summary query; logout clears it too.
  useEffect(() => {
    if (status === 'authenticated') setAuthHint();
  }, [status]);

  return null;
}

/**
 * Root client providers. Mounted once in the app root layout so that
 * session, theme, query cache, and toaster are shared across every
 * route group (storefront, admin, auth).
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  const pathname = usePathname();

  return (
    <SessionProvider
      session={SESSION_PATHS.test(pathname) ? undefined : null}
      refetchOnWindowFocus={false}
      refetchWhenOffline={false}
      refetchInterval={0}
    >
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <AuthHintSync />
          <CartBootstrap />
          {children}
          <Toaster duration={2000} />
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
