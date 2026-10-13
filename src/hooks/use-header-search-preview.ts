'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { PublicProductPage } from '@/contracts/catalog';
import { debounce } from '@/lib/debounce';

const SEARCH_PREVIEW_DEBOUNCE_MS = 400;
const SEARCH_PREVIEW_LIMIT = '8';
export const MIN_PREVIEW_CHARS = 3;
const PREVIEW_CACHE_TTL_MS = 60_000;
const PREVIEW_CACHE_MAX = 30;

// shortcut: per-tab in-memory cache, no cross-tab sharing; move to TanStack Query if more client caching is needed.
const previewCache = new Map<string, { data: PublicProductPage; at: number }>();

export const previewCacheKey = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ');

export function readPreviewCache(key: string, now = Date.now()): PublicProductPage | undefined {
  const hit = previewCache.get(key);
  if (!hit) return undefined;
  if (now - hit.at > PREVIEW_CACHE_TTL_MS) {
    previewCache.delete(key);
    return undefined;
  }
  return hit.data;
}

export function writePreviewCache(key: string, data: PublicProductPage, now = Date.now()): void {
  previewCache.delete(key);
  if (previewCache.size >= PREVIEW_CACHE_MAX) previewCache.delete(previewCache.keys().next().value!);
  previewCache.set(key, { data, at: now });
}

const emptyPublicProductPage: PublicProductPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: Number.parseInt(SEARCH_PREVIEW_LIMIT, 10) || 8,
};

export type UseHeaderSearchPreviewResult = {
  search: string;
  setSearch: (search: string) => void;
  preview: PublicProductPage | null;
  /** True while fetching, or when there is a query but preview has not arrived yet. */
  previewLoading: boolean;
  submitSearch: (e: FormEvent) => void;
};

export function useHeaderSearchPreview(): UseHeaderSearchPreviewResult {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<PublicProductPage | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchPreview = useCallback(async (q: string, signal: AbortSignal) => {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: SEARCH_PREVIEW_LIMIT });
      const res = await fetch(`/api/catalog/products?${params.toString()}`, { signal });
      if (!res.ok) {
        if (!signal.aborted) setPreview(emptyPublicProductPage);
        return;
      }
      const data: PublicProductPage = await res.json();
      writePreviewCache(previewCacheKey(q), data);
      if (!signal.aborted) setPreview(data);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (!signal.aborted) setPreview(emptyPublicProductPage);
    } finally {
      if (!signal.aborted) setPreviewLoading(false);
    }
  }, []);

  const fetchPreviewRef = useRef(fetchPreview);
  fetchPreviewRef.current = fetchPreview;

  const latestQueryRef = useRef('');
  const previewAbortRef = useRef<AbortController | null>(null);

  const schedulePreviewFetch = useRef(
    debounce(() => {
      const q = latestQueryRef.current;
      if (!q) return;
      previewAbortRef.current?.abort();
      const ac = new AbortController();
      previewAbortRef.current = ac;
      void fetchPreviewRef.current(q, ac.signal);
    }, SEARCH_PREVIEW_DEBOUNCE_MS),
  );

  useEffect(() => {
    const q = search.trim();
    latestQueryRef.current = q;
    const cachedPreview =
      q.length >= MIN_PREVIEW_CHARS ? readPreviewCache(previewCacheKey(q)) : undefined;
    if (q.length < MIN_PREVIEW_CHARS || cachedPreview) {
      schedulePreviewFetch.current.cancel();
      previewAbortRef.current?.abort();
      setPreview(cachedPreview ?? null);
      setPreviewLoading(false);
      return;
    }
    setPreview(null);
    schedulePreviewFetch.current();

    return () => {
      schedulePreviewFetch.current.cancel();
      previewAbortRef.current?.abort();
    };
  }, [search]);

  const submitSearch = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmedQuery = search.trim();
      router.push(trimmedQuery ? `/products?q=${encodeURIComponent(trimmedQuery)}` : '/products');
    },
    [router, search],
  );

  const trimmedSearch = search.trim();
  const effectivePreviewLoading = previewLoading || (trimmedSearch.length >= MIN_PREVIEW_CHARS && preview === null);

  return {
    search,
    setSearch,
    preview,
    previewLoading: effectivePreviewLoading,
    submitSearch,
  };
}
