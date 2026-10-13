'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatBDT } from '@/server/common/money';
import { MIN_PREVIEW_CHARS, useHeaderSearchPreview } from '@/hooks/use-header-search-preview';
import { useMobileSearch } from '../../../stores/mobile-search.store';

/**
 * Storefront search island: debounced product preview, submit-to-results,
 * click-outside dismissal, and the mobile collapse driven by the shared
 * mobile-search store. This is the only interactive piece of the top bar,
 * so all search client state lives here.
 */
export function HeaderSearch() {
  const { search, setSearch, preview, previewLoading, submitSearch } = useHeaderSearchPreview();
  const showSearchBar = useMobileSearch((state) => state.open);

  const [searchFocused, setSearchFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const trimmed = search.trim();
  const showPreviewPanel = searchFocused && trimmed.length >= MIN_PREVIEW_CHARS;

  // close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setSearchFocused(false);

    submitSearch(e);
  }

  function closePreview() {
    setSearchFocused(false);
  }

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'relative col-span-2 sm:col-span-1 order-3 sm:order-none sm:py-2 transition-all duration-300',

        showSearchBar
          ? 'max-sm:max-h-20 max-sm:opacity-100 max-sm:translate-y-0 max-sm:mt-2 pb-2'
          : 'max-sm:max-h-0 max-sm:opacity-0 max-sm:-translate-y-4 max-sm:mt-0',

        'sm:max-h-none sm:opacity-100 sm:translate-y-0',
      )}
    >
      <form className="flex h-10 w-full items-center" onSubmit={handleSubmit}>
        <Input
          type="search"
          placeholder="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          autoComplete="off"
          maxLength={100}
          className="dark:placeholder:text-white w-full h-full placeholder:text-sm text-sm"
        />
      </form>

      {showPreviewPanel && (
        <div
          className="
            absolute
            left-0
            right-0
            top-full
            mt-1
            max-h-80
            overflow-y-auto
            border
            border-gray-200
            bg-popover
            text-popover-foreground
            shadow-lg
            dark:border-[#222223]
            z-50
          "
        >
          {previewLoading && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Searching…</p>
          )}

          {!previewLoading && preview?.items?.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">No products found</p>
          )}

          {!previewLoading &&
            preview?.items.map((product) => (
              <Link
                key={product.id}
                href={`/products/${product.slug}`}
                onClick={closePreview}
                className="
                  flex
                  gap-3
                  px-3
                  py-2
                  text-sm
                  hover:bg-muted/80
                "
              >
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-muted">
                  <Image
                    src={product.imageUrl ?? '/logo.png'}
                    alt={product.name}
                    width={44}
                    height={44}
                    className={cn('h-full w-full object-cover', !product.imageUrl && 'p-2')}
                  />
                </div>

                <div className="flex-1 text-left">
                  <p className="truncate text-xs text-muted-foreground">{product.brand.name}</p>

                  <p className="truncate font-medium text-xs leading-snug">{product.name}</p>

                  <p className="text-xs font-semibold">{formatBDT(product.priceCents)}</p>
                </div>
              </Link>
            ))}

          {!previewLoading && preview && preview.total > preview.items.length && (
            <Link
              href={`/products?q=${encodeURIComponent(trimmed)}`}
              prefetch={false}
              onClick={closePreview}
              className="
                  block
                  border-t
                  border-border
                  px-3
                  py-2
                  text-center
                  text-sm
                  font-medium
                  text-primary
                  hover:bg-muted/80
                "
            >
              View all {preview.total} results
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
