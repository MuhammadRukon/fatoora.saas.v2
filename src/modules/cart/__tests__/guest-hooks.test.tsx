// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ status: 'unauthenticated' as string }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
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
vi.mock('sonner', () => ({ toast }));

import type { CartLine } from '@/contracts/cart';
import { useGuestCart } from '../guest-cart';
import { useCartBadgeCount, useCartMutations, useGuestCartMerge, useGuestSnapshot } from '../hooks';

const DAY = 24 * 60 * 60 * 1000;

const line = (variantId: string, over: Partial<CartLine> = {}): CartLine => ({
  itemId: variantId,
  variantId,
  productId: '',
  productSlug: variantId,
  productName: variantId,
  variantName: null,
  sku: variantId,
  imageUrl: null,
  unitPriceCents: 1000,
  originalUnitPriceCents: 1000,
  quantity: 1,
  stock: 10,
  isActive: true,
  ...over,
});

function stubFetch(
  handler: (url: string, init?: RequestInit) => { status: number; body: unknown },
) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status, body } = handler(url, init);
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const hydrateCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([url]) => url === '/api/cart/hydrate');

beforeEach(() => {
  storage.clear();
  vi.clearAllMocks();
  session.status = 'unauthenticated';
  useGuestCart.setState({ lines: [], lastValidatedAt: null, unavailable: [], prunedCount: 0 });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('guest badge', () => {
  it('counts only lines that are not dead per the last hydrate, with 0 requests', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: {} }));
    useGuestCart.setState({
      lines: [
        { variantId: 'ok', quantity: 2 },
        { variantId: 'sold', quantity: 3 },
      ],
      unavailable: ['sold'],
    });
    const { wrapper } = setup();
    const { result } = renderHook(() => useCartBadgeCount(), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('guest hydrate', () => {
  const lines = [
    { variantId: 'ok', quantity: 1 },
    { variantId: 'sold', quantity: 2 },
    { variantId: 'gone', quantity: 1 },
  ];
  const respond = () => {
    const returned = [line('ok'), line('sold', { stock: 0, quantity: 2 })];
    return { status: 200, body: { lines: returned, subtotalCents: 1000, itemCount: 3 } };
  };

  it('prunes only the deleted variant, keeps the sold-out line, and fires exactly one hydrate', async () => {
    const fetchMock = stubFetch(respond);
    useGuestCart.setState({ lines });
    const { wrapper } = setup();
    const { result } = renderHook(() => useGuestSnapshot(), { wrapper });

    await waitFor(() => expect(useGuestCart.getState().lines).toHaveLength(2));
    await waitFor(() => expect(result.current.data?.lines).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30)); // a second hydrate would show up by now

    const s = useGuestCart.getState();
    expect(s.lines.map((l) => l.variantId)).toEqual(['ok', 'sold']);
    expect(s.unavailable).toEqual(['sold']);
    expect(s.prunedCount).toBe(1);
    expect(s.lastValidatedAt).not.toBeNull();
    expect(hydrateCalls(fetchMock)).toHaveLength(1);
  });

  it('opening again within 30 s does not hydrate; a cart validated over 24 h ago forces one', async () => {
    const fetchMock = stubFetch(respond);
    useGuestCart.setState({ lines: [lines[0]] });
    const { wrapper } = setup();
    const first = renderHook(() => useGuestSnapshot(), { wrapper });
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();
    expect(hydrateCalls(fetchMock)).toHaveLength(1);

    const second = renderHook(() => useGuestSnapshot(), { wrapper });
    await waitFor(() => expect(second.result.current.data).toBeDefined());
    await new Promise((r) => setTimeout(r, 30));
    expect(hydrateCalls(fetchMock)).toHaveLength(1);
    second.unmount();

    act(() => useGuestCart.setState({ lastValidatedAt: Date.now() - DAY - 1000 }));
    const third = renderHook(() => useGuestSnapshot(), { wrapper });
    await waitFor(() => expect(hydrateCalls(fetchMock)).toHaveLength(2));
    await new Promise((r) => setTimeout(r, 30));
    expect(hydrateCalls(fetchMock)).toHaveLength(2);
    third.unmount();
  });
});

describe('guest add/update past stock', () => {
  it('is blocked with an error toast, 0 requests and an unchanged quantity', async () => {
    const fetchMock = stubFetch(() => ({ status: 200, body: {} }));
    useGuestCart.setState({ lines: [{ variantId: 'v', quantity: 2 }] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useCartMutations(), { wrapper });

    await act(async () => {
      await result.current.updateItem
        .mutateAsync({ itemId: 'v', variantId: 'v', quantity: 3, maxStock: 2 })
        .catch(() => undefined);
    });
    await act(async () => {
      await result.current.addItem
        .mutateAsync({ variantId: 'v', quantity: 1, maxStock: 2 })
        .catch(() => undefined);
    });

    expect(useGuestCart.getState().lines).toEqual([{ variantId: 'v', quantity: 2 }]);
    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith('Only 2 in stock');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useGuestCartMerge', () => {
  const guestLines = [
    { variantId: 'a', quantity: 2 },
    { variantId: 'b', quantity: 1 },
  ];

  it('shows ONE toast for the adjustments and clears the store on success', async () => {
    session.status = 'authenticated';
    stubFetch(() => ({
      status: 200,
      body: {
        lines: [],
        subtotalCents: 0,
        itemCount: 0,
        adjustments: [
          { variantId: 'a', requested: 2, applied: 0 },
          { variantId: 'b', name: 'B', requested: 1, applied: 0 },
        ],
      },
    }));
    useGuestCart.setState({ lines: guestLines });
    const { wrapper } = setup();
    renderHook(() => useGuestCartMerge(), { wrapper });

    await waitFor(() => expect(useGuestCart.getState().lines).toEqual([]));
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith('2 items were removed or reduced because of stock');
  });

  it('shows no toast when nothing was adjusted, and tolerates a response without adjustments', async () => {
    session.status = 'authenticated';
    stubFetch(() => ({ status: 200, body: { lines: [], subtotalCents: 0, itemCount: 0 } }));
    useGuestCart.setState({ lines: guestLines });
    const { wrapper } = setup();
    renderHook(() => useGuestCartMerge(), { wrapper });

    await waitFor(() => expect(useGuestCart.getState().lines).toEqual([]));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('a storage rehydrate while the PUT is in flight does not send a second PUT', async () => {
    session.status = 'authenticated';
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async () => {
      await gate;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ lines: [], subtotalCents: 0, itemCount: 0 }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);
    useGuestCart.setState({ lines: guestLines });
    const { wrapper } = setup();
    renderHook(() => useGuestCartMerge(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Another tab's write rehydrates the store: same lines, new array reference.
    act(() => useGuestCart.setState({ lines: guestLines.map((l) => ({ ...l })) }));
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => expect(useGuestCart.getState().lines).toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed merge keeps the store and shows no toast', async () => {
    session.status = 'authenticated';
    const fetchMock = stubFetch(() => ({ status: 500, body: { code: 'INTERNAL', message: 'x' } }));
    useGuestCart.setState({ lines: guestLines });
    const { wrapper } = setup();
    renderHook(() => useGuestCartMerge(), { wrapper });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(useGuestCart.getState().lines).toEqual(guestLines);
    expect(toast.info).not.toHaveBeenCalled();
  });
});
