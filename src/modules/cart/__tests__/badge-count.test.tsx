// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ status: 'unauthenticated' as string }));
// Node's own `localStorage` getter shadows jsdom's (undefined without --localstorage-file),
// and the zustand store reads it at import time, so stub before imports.
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const api = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true });
  return api;
});
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: session.status }) }));

import { readAuthHint, setAuthHint } from '@/lib/auth-hint';
import { useGuestCart } from '../guest-cart';
import { useCartBadgeCount } from '../hooks';

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useCartBadgeCount(), { wrapper });
}

beforeEach(() => {
  storage.clear();
  session.status = 'unauthenticated';
  useGuestCart.setState({ lines: [] });
});
afterEach(() => vi.unstubAllGlobals());

describe('useCartBadgeCount', () => {
  it('guest: sums store quantities after mount with 0 requests', async () => {
    const fetchMock = stubFetch(200, {});
    useGuestCart.setState({
      lines: [
        { variantId: 'a', quantity: 2 },
        { variantId: 'b', quantity: 1 },
      ],
    });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(3));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hint present: summary fires while the session is still loading', async () => {
    setAuthHint();
    session.status = 'loading';
    const fetchMock = stubFetch(200, { itemCount: 4, subtotalCents: 1, hasIssues: false });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(4));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/cart?view=summary', expect.anything());
  });

  it('no hint and no session: no summary request', async () => {
    const fetchMock = stubFetch(200, {});
    render();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forged hint: one 401 clears the hint and is not retried', async () => {
    setAuthHint();
    session.status = 'loading';
    const fetchMock = stubFetch(401, { code: 'UNAUTHORIZED', message: 'no' });
    render();
    await waitFor(() => expect(readAuthHint()).toBe(false));
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('authenticated: badge comes from the summary', async () => {
    session.status = 'authenticated';
    stubFetch(200, { itemCount: 7, subtotalCents: 1, hasIssues: false });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe(7));
  });
});
