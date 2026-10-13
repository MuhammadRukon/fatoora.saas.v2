// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import type { PublicProductPage } from '@/contracts/catalog';
import {
  previewCacheKey,
  readPreviewCache,
  useHeaderSearchPreview,
  writePreviewCache,
} from '../use-header-search-preview';

const page = (name: string) =>
  ({ items: [{ id: name, name }], total: 1, page: 1, pageSize: 8 }) as unknown as PublicProductPage;
const okResponse = (name: string) => ({ ok: true, json: async () => page(name) });

// Resolves with `respond(url)`, or rejects with AbortError when the signal aborts first.
function stubFetch(respond: (url: string) => unknown = (url) => okResponse(url)) {
  const fetchMock = vi.fn((url: string, init: { signal: AbortSignal }) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
      resolve(respond(url));
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const type = async (result: { current: { setSearch: (s: string) => void } }, value: string, ms = 0) => {
  act(() => result.current.setSearch(value));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('preview cache helpers', () => {
  it('normalizes the key: trimmed, lowercased, whitespace collapsed', () => {
    expect(previewCacheKey('  iPh   One ')).toBe('iph one');
  });

  it('expires entries after 60s', () => {
    writePreviewCache('ttl-q', page('a'), 1_000);
    expect(readPreviewCache('ttl-q', 60_999)).toEqual(page('a'));
    expect(readPreviewCache('ttl-q', 61_001)).toBeUndefined();
  });

  it('keeps at most 30 entries, evicting the oldest first', () => {
    for (let i = 0; i < 31; i++) writePreviewCache(`cap-${i}`, page(String(i)), 5_000);
    expect(readPreviewCache('cap-0', 5_000)).toBeUndefined();
    expect(readPreviewCache('cap-1', 5_000)).toEqual(page('1'));
    expect(readPreviewCache('cap-30', 5_000)).toEqual(page('30'));
  });
});

describe('useHeaderSearchPreview', () => {
  it('1-2 characters issue no request and show no loading state; the 3rd issues exactly one after the debounce', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useHeaderSearchPreview());
    await type(result, 'a', 1000);
    await type(result, 'ab', 1000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.previewLoading).toBe(false);
    expect(result.current.preview).toBeNull();

    await type(result, 'abc', 399);
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('q=abc');
    expect(result.current.preview).toEqual(page(fetchMock.mock.calls[0][0]));
  });

  it('dropping below 3 characters aborts the in-flight request and clears the preview', async () => {
    const fetchMock = stubFetch(() => new Promise(() => {}));
    const { result } = renderHook(() => useHeaderSearchPreview());
    await type(result, 'drop', 400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.previewLoading).toBe(true);
    await type(result, 'dr', 0);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(result.current.previewLoading).toBe(false);
    expect(result.current.preview).toBeNull();
  });

  it('retyping a query within 60s is served from the cache with no second request', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useHeaderSearchPreview());
    await type(result, 'cacheme', 400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await type(result, '', 0);
    expect(result.current.preview).toBeNull();
    await type(result, 'CacheMe ', 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.preview).not.toBeNull();
    expect(result.current.previewLoading).toBe(false);
  });

  it('a quick follow-up keystroke aborts the first request; only the second completes', async () => {
    const fetchMock = stubFetch();
    const { result } = renderHook(() => useHeaderSearchPreview());
    let first!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((resolve, reject) => {
          first = resolve;
          init.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await type(result, 'quick', 400);
    await type(result, 'quickr', 400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
    expect(result.current.preview).toEqual(page(fetchMock.mock.calls[1][0]));
    first(okResponse('late'));
  });

  it('never caches error fallbacks: the same query fetches again after a failure', async () => {
    const fetchMock = stubFetch(() => ({ ok: false }));
    const { result } = renderHook(() => useHeaderSearchPreview());
    await type(result, 'broken', 400);
    expect(result.current.preview?.items).toEqual([]);
    await type(result, '', 0);
    await type(result, 'broken', 400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Enter navigates to /products?q= for a 2-character query', async () => {
    stubFetch();
    const { result } = renderHook(() => useHeaderSearchPreview());
    await type(result, 'ip', 0);
    act(() => result.current.submitSearch({ preventDefault() {} } as never));
    expect(push).toHaveBeenCalledWith('/products?q=ip');
  });
});
