// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ status: 'authenticated' as string }));
// Node's own `localStorage` getter shadows jsdom's (undefined without --localstorage-file),
// and the cart store reads it at import time, so stub before imports.
vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
    },
    configurable: true,
  });
});
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: session.status }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import type { CartLine, CartSnapshot } from '@/contracts/cart';
import { useCheckoutCartCleanup } from '../use-cart-cleanup';

const line = (id: string, over: Partial<CartLine> = {}): CartLine => ({
  itemId: `item-${id}`,
  variantId: id,
  productId: '',
  productSlug: id,
  productName: id.toUpperCase(),
  variantName: null,
  sku: id,
  imageUrl: null,
  unitPriceCents: 1000,
  originalUnitPriceCents: 1000,
  quantity: 1,
  stock: 10,
  isActive: true,
  ...over,
});

const snapshot = (lines: CartLine[]): CartSnapshot => ({
  lines,
  subtotalCents: 0,
  itemCount: lines.reduce((n, l) => n + l.quantity, 0),
});

function stubCartApi(initial: CartLine[]) {
  let lines = initial;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') {
      const id = url.split('/').pop();
      lines = lines.filter((l) => l.itemId !== id);
    } else if (method === 'PATCH') {
      const id = url.split('/').pop();
      const { quantity } = JSON.parse(String(init?.body));
      lines = lines.map((l) => (l.itemId === id ? { ...l, quantity } : l));
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(snapshot(lines)) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const methods = (fetchMock: ReturnType<typeof stubCartApi>) =>
  fetchMock.mock.calls.map(([url, init]) => `${(init as RequestInit)?.method ?? 'GET'} ${url}`);

function setup(hasIssues: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return {
    client,
    ...renderHook(({ issues }) => useCheckoutCartCleanup(issues), {
      wrapper,
      initialProps: { issues: hasIssues },
    }),
  };
}

beforeEach(() => {
  session.status = 'authenticated';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useCheckoutCartCleanup', () => {
  it('removes the sold-out line, clamps the other, and reports both: 1 DELETE + 1 PATCH', async () => {
    const fetchMock = stubCartApi([
      line('sold', { stock: 0 }),
      line('over', { quantity: 5, stock: 2 }),
      line('ok'),
    ]);
    const { result } = setup(true);

    expect(result.current.cleaning).toBe(true);
    await waitFor(() => expect(result.current.cleaning).toBe(false));

    expect(result.current.notice).toBe(
      'We removed SOLD. Quantity of OVER reduced to 2, only 2 in stock.',
    );
    expect(methods(fetchMock)).toEqual([
      'GET /api/cart',
      'DELETE /api/cart/item-sold',
      'PATCH /api/cart/item-over',
    ]);
  });

  it('issues no requests when the cart has no issues', async () => {
    const fetchMock = stubCartApi([line('ok')]);
    const { result } = setup(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current).toEqual({ cleaning: false, notice: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('waits for an authenticated session before touching the cart', async () => {
    session.status = 'loading';
    const fetchMock = stubCartApi([line('sold', { stock: 0 })]);
    const { result } = setup(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.cleaning).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed removal ends the cleanup with a notice pointing at the cart, and is not retried', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        return {
          ok: false,
          status: 404,
          text: async () => JSON.stringify({ code: 'NOT_FOUND', message: 'x' }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(snapshot([line('sold', { stock: 0 })])),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = setup(true);
    await waitFor(() => expect(result.current.cleaning).toBe(false));
    expect(result.current.notice).toBe('Some items could not be updated. Review your cart.');
    await new Promise((r) => setTimeout(r, 30)); // a retry loop would show up by now
    expect(methods(fetchMock).filter((m) => m.startsWith('DELETE'))).toHaveLength(1);
  });

  it('issues that come back after a finished cleanup block the form again and are cleaned up', async () => {
    const fetchMock = stubCartApi([line('sold', { stock: 0 })]);
    const { result, rerender } = setup(true);
    await waitFor(() => expect(result.current.cleaning).toBe(false));

    rerender({ issues: false });
    rerender({ issues: true });
    expect(result.current.cleaning).toBe(true);
    await waitFor(() => expect(result.current.cleaning).toBe(false));
    expect(methods(fetchMock).filter((m) => m.startsWith('GET'))).toHaveLength(2);
  });
});
