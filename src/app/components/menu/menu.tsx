'use client';

import Link from 'next/link';

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { slugify } from '@/server/common/slug';
import type { MenuBrand, MenuCategory, MenuItemProps } from './menu.types';

function categoryHref(category: MenuCategory): string {
  return `/category/${category.slug ?? slugify(category.name)}`;
}

function brandHref(brand: MenuBrand): string {
  return `/brand/${brand.slug ?? slugify(brand.name)}`;
}

export function Menu({ menu }: Readonly<{ menu: MenuCategory[] }>) {
  if (menu.length === 0) return null;
  return (
    <NavigationMenu viewport={false}>
      <NavigationMenuList>
        {menu.map((category) =>
          category.brands.length > 0 ? (
            <Menu.ItemWithBrand key={category.id} category={category} />
          ) : (
            <Menu.Item key={category.id} category={category} />
          ),
        )}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

Menu.Item = function MenuItem({ category }: MenuItemProps) {
  return (
    <NavigationMenuItem>
      <NavigationMenuLink asChild className="h-full px-3 py-1.5">
        <Link href={categoryHref(category)}>{category.name}</Link>
      </NavigationMenuLink>
    </NavigationMenuItem>
  );
};

Menu.ItemWithBrand = function MenuItemWithBrand({ category }: MenuItemProps) {
  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger className="p-2.5 px-3.5 h-full" asChild>
        <Link href={categoryHref(category)}>{category.name}</Link>
      </NavigationMenuTrigger>
      <NavigationMenuContent className="absolute p-0 z-50 bg-background min-w-fit ">
        <ul className="min-w-fit sm:min-w-[150px]">
          {category.brands.map((brand) => (
            <ListItem key={brand.id} brand={brand} />
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
};

function ListItem({ brand }: Readonly<{ brand: MenuBrand }>) {
  return (
    <li>
      <NavigationMenuLink className="py-2 px-4 h-full" asChild>
        <Link href={brandHref(brand)}>{brand.name}</Link>
      </NavigationMenuLink>
    </li>
  );
}
