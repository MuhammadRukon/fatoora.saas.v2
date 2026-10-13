'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, ChevronRight, ChevronDown } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

import { Button } from '@/components/ui/button';
import { slugify } from '@/server/common/slug';
import type { MenuBrand, MenuCategory } from '@/app/components/menu/menu.types';
import { cn } from '@/lib/utils';

interface AppSidebarProps {
  items: MenuCategory[];
}

function categoryHref(category: MenuCategory) {
  return `/category/${category.slug ?? slugify(category.name)}`;
}

function brandHref(brand: MenuBrand) {
  return `/brand/${brand.slug ?? slugify(brand.name)}`;
}

export function CategorySidebar({ items }: AppSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-80 p-0 gap-0">
        <SheetHeader className=" px-4 py-3">
          <SheetTitle>Categories</SheetTitle>
        </SheetHeader>

        <nav className="overflow-y-auto">
          {items.map((category) => (
            <CategoryItem key={category.id} category={category} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function CategoryItem({ category }: Readonly<{ category: MenuCategory }>) {
  const [open, setOpen] = useState(false);

  const hasChildren = category.brands.length > 0;

  return (
    <div>
      <div className="flex items-center">
        <SheetClose asChild>
          <Link href={categoryHref(category)} className="flex-1 px-4 py-2 text-sm hover:bg-accent">
            {category.name}
          </Link>
        </SheetClose>

        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center hover:bg-accent"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        )}
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-4 border-l">
            {category.brands.map((brand) => (
              <SheetClose asChild key={brand.id}>
                <Link href={brandHref(brand)} className="block px-4 py-2 text-sm hover:bg-accent">
                  {brand.name}
                </Link>
              </SheetClose>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
