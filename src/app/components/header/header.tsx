import { JSX } from 'react';

import { Container } from '@/app/components/container/container';
import { Menu } from '@/app/components/menu/menu';
import { HeaderAccount } from '@/app/components/header/header-account';
import { HeaderLogo } from '@/app/components/header/header-logo';
import { HeaderSearch } from '@/app/components/header/header-search';
import { MobileSearchToggle } from '@/app/components/header/mobile-search-toggle';
import { CartPanel } from '@/app/components/cart-panel/cart-panel';
import { CategorySidebar } from '@/components/category-sidebar';
import type { MenuCategory } from '@/app/components/menu/menu.types';

export interface HeaderProps {
  menu: MenuCategory[];
}

/**
 * Server-rendered storefront header shell. The static layout (logo, menu,
 * grid) renders on the server; only the interactive leaves ship client JS:
 * HeaderSearch, MobileSearchToggle, CartPanel, HeaderAccount, CategorySidebar
 * and the Menu flyout.
 */
export function Header({ menu }: Readonly<HeaderProps>): JSX.Element {
  return (
    <header className="sticky top-0 z-50">
      <div className="bg-[#f9fafc] dark:bg-background border-b border-gray-200 dark:border-[#222223]">
        <Container>
          <div className="grid grid-cols-2 sm:grid-cols-3 items-center justify-between">
            <div className="flex items-center gap-4 order-1 sm:order-none">
              <div className="md:hidden">
                <CategorySidebar items={menu} />
              </div>
              <HeaderLogo />
            </div>

            <HeaderSearch />

            <div className="flex h-full items-center gap-6 justify-end order-2 sm:order-none">
              <CartPanel />
              <MobileSearchToggle />
              <HeaderAccount />
            </div>
          </div>
        </Container>
      </div>

      <div className="border-b max-md:hidden border-gray-200 dark:border-[#222223] bg-white dark:bg-background">
        <Container>
          <Menu menu={menu} />
        </Container>
      </div>
    </header>
  );
}
