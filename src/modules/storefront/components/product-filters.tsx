'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Switch } from '@/components/ui/switch';

interface BrandOption {
  id: string;
  name: string;
  slug: string;
}

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  brands: BrandOption[];
  categories: CategoryOption[];
  lockedCategorySlug?: string;
  lockedBrandSlug?: string;
}

const ANY = '__any__';

export function ProductFilters({
  brands,
  categories,
  lockedCategorySlug,
  lockedBrandSlug,
}: Readonly<Props>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [, startTransition] = useTransition();

  const [open, setOpen] = useState(false);

  function setParam(key: string, value: string | null) {
    const sp = new URLSearchParams(params);

    if (!value) {
      sp.delete(key);
    } else {
      sp.set(key, value);
    }

    sp.delete('page');

    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }

  function clearAll() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  const sort = params.get('sort') ?? 'newest';

  const inStock = params.get('inStock') === 'true';

  const minPrice = params.get('minPrice') ?? '';

  const maxPrice = params.get('maxPrice') ?? '';

  const categorySlug = lockedCategorySlug ?? params.get('categorySlug') ?? '';

  const brandSlug = lockedBrandSlug ?? params.get('brandSlug') ?? '';

  return (
    <div>
      {/* Mobile only */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="
          md:hidden
          flex
          w-full
          items-center
          justify-between
          border-b
          pb-2
        "
      >
        {/* Not a heading: this sidebar/disclosure label sits before the
            page's own <h1> in DOM order, so a real <h2> here would break
            heading hierarchy for crawlers and screen readers. */}
        <span className="text-lg font-semibold">Filter Panel</span>

        <ChevronDown
          className={cn('size-5 transition-transform duration-300', open && 'rotate-180')}
        />
      </button>

      <span className="text-lg font-semibold  max-md:hidden pt-10 pb-2 border-b block">
        Filter Panel
      </span>

      <div
        className={cn(
          `
          overflow-hidden
          transition-all
          duration-300
          ease-in-out
          md:pt-4
          `,

          // mobile animation
          open
            ? 'max-md:max-h-[800px] max-md:opacity-100 max-md:pt-4'
            : 'max-md:max-h-0 max-md:opacity-0',

          // desktop always visible
          'md:max-h-none md:opacity-100',
        )}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            {!lockedCategorySlug && (
              <div className="flex-1 space-y-2">
                <Label>Category</Label>

                <Select
                  value={categorySlug || ANY}
                  onValueChange={(v) => setParam('categorySlug', v === ANY ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>

                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.slug}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!lockedBrandSlug && (
              <div className="flex-1 space-y-2">
                <Label>Brand</Label>

                <Select
                  value={brandSlug || ANY}
                  onValueChange={(v) => setParam('brandSlug', v === ANY ? null : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>

                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.slug}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Sort</Label>

            <Select value={sort} onValueChange={(v) => setParam('sort', v === 'newest' ? null : v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>

                <SelectItem value="price_asc">Price low-high</SelectItem>

                <SelectItem value="price_desc">Price high-low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Min ৳</Label>

              <Input
                defaultValue={minPrice}
                inputMode="numeric"
                onBlur={(e) => setParam('minPrice', e.target.value || null)}
              />
            </div>

            <div className="space-y-1">
              <Label>Max ৳</Label>

              <Input
                defaultValue={maxPrice}
                inputMode="numeric"
                onBlur={(e) => setParam('maxPrice', e.target.value || null)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label>In stock only</Label>

            <Switch
              checked={inStock}
              onCheckedChange={(v) => setParam('inStock', v ? 'true' : null)}
            />
          </div>

          <Button variant="outline" className="w-full" onClick={clearAll}>
            Clear filters
          </Button>
        </div>
      </div>
    </div>
  );
}
