'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

import { clearAuthHint, readAuthHint } from '@/lib/auth-hint';
import { ApiClientError, apiFetch } from '@/lib/fetcher';
import { queryKeys } from '@/constants/queryKeys';
import { mergeResultSchema, type CartSnapshot, type CartSummary } from '@/contracts/cart';
import { classifyHydrate, guestBadgeCount, needsRevalidation } from './availability';
import { useGuestCart } from './guest-cart';

const CART_URL = '/api/cart';

function explainError(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const stockMessage = (maxStock?: number) =>
  maxStock === 0 ? 'Out of stock' : `Only ${maxStock} in stock`;

interface ServerCartOptions {
  staleTime?: number;
  refetchOnMount?: boolean;
}

const isUnauthorized = (err: unknown) => err instanceof ApiClientError && err.status === 401;

export function useServerCart(
  view: 'full',
  options?: ServerCartOptions,
): ReturnType<typeof useQuery<CartSnapshot>>;
export function useServerCart(
  view: 'summary',
  options?: ServerCartOptions,
): ReturnType<typeof useQuery<CartSummary>>;
export function useServerCart(
  view: 'full' | 'summary' = 'full',
  options: ServerCartOptions = {},
): ReturnType<typeof useQuery<CartSnapshot | CartSummary>> {
  const { status } = useSession();
  const url = view === 'summary' ? `${CART_URL}?view=summary` : CART_URL;
  return useQuery({
    queryKey: view === 'summary' ? queryKeys.cartSummary : queryKeys.cart,
    queryFn: () =>
      apiFetch<CartSnapshot | CartSummary>(url).catch((err: unknown) => {
        // A forged or stale hint: the server says there is no session.
        if (isUnauthorized(err)) clearAuthHint();
        throw err;
      }),
    // With the hint the summary starts in parallel with the session call instead of waiting for it.
    enabled: status === 'authenticated' || (view === 'summary' && readAuthHint()),
    retry: (count, err) => !isUnauthorized(err) && count < 1,
    ...options,
  });
}

const EMPTY_SNAPSHOT: CartSnapshot = { lines: [], subtotalCents: 0, itemCount: 0 };

/**
 * Hydrates the guest cart against the catalog so the UI can show
 * names, prices, and images while the user is signed out. Lives in
 * the query cache so every consumer (page, panel, header) shares it
 * via React Query's automatic deduplication.
 */
export function useGuestSnapshot(): ReturnType<typeof useQuery<CartSnapshot>> {
  const { status } = useSession();
  const qc = useQueryClient();
  const lines = useGuestCart((s) => s.lines);
  const isUnauthenticated = status === 'unauthenticated';

  const query = useQuery({
    queryKey: queryKeys.cartGuest(lines),
    queryFn: async () => {
      if (lines.length === 0) return EMPTY_SNAPSHOT;
      const snapshot = await apiFetch<CartSnapshot>('/api/cart/hydrate', {
        method: 'POST',
        body: { lines },
      });
      // Only variants that no longer exist are pruned; inactive or sold-out lines stay visible.
      const result = classifyHydrate(lines, snapshot);
      if (result.missing.length > 0) {
        // The prune changes the key: seed it so it does not trigger a second hydrate.
        const remaining = lines.filter((l) => !result.missing.includes(l.variantId));
        qc.setQueryData(queryKeys.cartGuest(remaining), snapshot);
      }
      useGuestCart.getState().applyHydrate(result);
      return snapshot;
    },
    enabled: isUnauthenticated,
    placeholderData: (prev) => prev,
  });

  // staleTime stays 30 s; a cart validated over 24 h ago is re-checked on every panel open / cart view.
  const { refetch } = query;
  useEffect(() => {
    const { lines: stored, lastValidatedAt } = useGuestCart.getState();
    if (!isUnauthenticated || stored.length === 0 || !needsRevalidation(lastValidatedAt)) return;
    void refetch({ cancelRefetch: false });
  }, [isUnauthenticated, refetch]);

  return query;
}

/**
 * Single consumer hook for hydrated cart state. Branches on session
 * status so the same component code works for guests and signed-in
 * users. Both branches are TanStack queries, so calling this hook
 * from multiple components in the tree (page, panel, header) results
 * in a single network request per cache key.
 */
export function useCart(): {
  cart: CartSnapshot | null | undefined;
  isLoading: boolean;
  /** Guest prices are being (re)hydrated: show skeletons instead of stale prices. */
  isPriceLoading: boolean;
  isAuthenticated: boolean;
} {
  const { status } = useSession();
  const server = useServerCart('full');
  const guest = useGuestSnapshot();
  const isAuthenticated = status === 'authenticated';

  return {
    cart: isAuthenticated ? server.data : guest.data,
    isLoading: status === 'loading' || (isAuthenticated ? server.isLoading : guest.isLoading),
    isPriceLoading: !isAuthenticated && guest.isFetching,
    isAuthenticated,
  };
}

/**
 * Header badge count. Guests: localStorage store minus the lines the last
 * hydrate found dead (never a request). Signed-in: the
 * cheap summary query, kept for 5 minutes and updated by cart mutations via
 * setQueryData. Renders 0 until mounted so SSR and hydration markup match.
 */
export function useCartBadgeCount(): number {
  const { status } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const guestCount = useGuestCart((s) => guestBadgeCount(s.lines, s.unavailable));
  const summary = useServerCart('summary', { staleTime: 5 * 60_000, refetchOnMount: false });

  if (!mounted) return 0;
  return status === 'unauthenticated' ? guestCount : (summary.data?.itemCount ?? 0);
}

export function useCartMutations() {
  const qc = useQueryClient();
  const { status } = useSession();
  // Actions are read at call time: subscribing to the whole store re-rendered every caller on each hydrate.
  const guest = useGuestCart.getState;
  const syncCartCache = (snapshot: CartSnapshot | null) => {
    if (!snapshot) return;
    qc.setQueryData(queryKeys.cart, snapshot);
    qc.setQueryData(queryKeys.cartSummary, {
      subtotalCents: snapshot.subtotalCents,
      itemCount: snapshot.itemCount,
      hasIssues: snapshot.lines.some((line) => !line.isActive || line.quantity > line.stock),
    } satisfies CartSummary);
  };

  const addItem = useMutation({
    // maxStock: known stock, enforced for guests only (the server checks for signed-in users).
    mutationFn: async (input: { variantId: string; quantity: number; maxStock?: number }) => {
      if (status !== 'authenticated') {
        if (!guest().add(input.variantId, input.quantity, input.maxStock)) {
          throw new Error(stockMessage(input.maxStock));
        }
        return null;
      }
      return apiFetch<CartSnapshot>(CART_URL, {
        method: 'POST',
        body: { variantId: input.variantId, quantity: input.quantity },
      });
    },
    onSuccess: (snapshot) => {
      syncCartCache(snapshot);
      toast.success('Added to cart');
    },
    onError: (err) => toast.error(explainError(err, 'Could not add to cart')),
  });

  const updateItem = useMutation({
    mutationFn: async (input: {
      itemId: string;
      variantId: string;
      quantity: number;
      maxStock?: number;
    }) => {
      if (status !== 'authenticated') {
        if (!guest().setQuantity(input.variantId, input.quantity, input.maxStock)) {
          throw new Error(stockMessage(input.maxStock));
        }
        return null;
      }
      return apiFetch<CartSnapshot>(`${CART_URL}/${input.itemId}`, {
        method: 'PATCH',
        body: { quantity: input.quantity },
      });
    },
    onSuccess: (snapshot) => {
      syncCartCache(snapshot);
      toast.success('Quantity updated');
    },
    onError: (err) => toast.error(explainError(err, 'Could not update quantity')),
  });

  const removeItem = useMutation({
    mutationFn: async (input: { itemId: string; variantId: string }) => {
      if (status !== 'authenticated') {
        guest().remove(input.variantId);
        return null;
      }
      return apiFetch<CartSnapshot>(`${CART_URL}/${input.itemId}`, { method: 'DELETE' });
    },
    onSuccess: (snapshot) => syncCartCache(snapshot),
    onError: (err) => toast.error(explainError(err, 'Could not remove item')),
  });

  return { addItem, updateItem, removeItem };
}

/**
 * Merges the persisted guest cart into the server cart immediately
 * after the user authenticates. Idempotent; safe to mount multiple
 * times (the merge call is no-op when the store is empty).
 */
export function useGuestCartMerge() {
  const { status } = useSession();
  const qc = useQueryClient();
  const lines = useGuestCart((s) => s.lines);
  const clear = useGuestCart((s) => s.clear);
  // A rehydrate (new `lines` reference) re-runs the effect: a second PUT would double the quantities.
  const inFlight = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || lines.length === 0 || inFlight.current) return;
    inFlight.current = true;
    void apiFetch<unknown>(CART_URL, {
      method: 'PUT',
      body: { lines },
    })
      .then((res) => {
        // An unexpected shape must not stop the store from clearing (the merge already happened).
        const adjusted = mergeResultSchema.safeParse(res).data?.adjustments.length ?? 0;
        clear();
        qc.invalidateQueries({ queryKey: queryKeys.cart });
        qc.invalidateQueries({ queryKey: queryKeys.cartSummary });
        if (adjusted > 0) {
          toast.info(
            `${adjusted} ${adjusted === 1 ? 'item was' : 'items were'} removed or reduced because of stock`,
          );
        }
      })
      .catch(() => {
        // We swallow the error so the login flow is never blocked by
        // a transient merge failure. The guest cart stays around so a
        // retry on the next render will succeed.
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [status, lines, clear, qc]);
}
