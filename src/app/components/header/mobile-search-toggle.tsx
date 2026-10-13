'use client';

import { SearchIcon } from 'lucide-react';

import { useMobileSearch } from '../../../stores/mobile-search.store';

/**
 * Mobile-only button that reveals the collapsible search bar. Lives in the
 * header's right-hand cluster; the search bar itself reads the same store.
 */
export function MobileSearchToggle() {
  const toggle = useMobileSearch((state) => state.toggle);

  return (
    <SearchIcon
      size={18}
      className="sm:hidden cursor-pointer"
      aria-label="Toggle search"
      onClick={toggle}
    />
  );
}
