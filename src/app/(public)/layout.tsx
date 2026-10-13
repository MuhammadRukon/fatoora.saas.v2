import { Container } from '../components/container/container';
import { Footer } from '../components/footer/footer';
import { Header } from '../components/header/header';
import type { MenuCategory } from '../components/menu/menu.types';

import { catalogService } from '@/server/catalog/catalog.service';

/**
 * Public storefront shell. Loads navigation data (categories, brands)
 * server-side so the header is rendered with real menu links and is
 * SEO-crawlable. This server fetch is reused across every storefront
 * page render.
 */
async function loadMenu(): Promise<MenuCategory[]> {
  const { categories, brands } = await catalogService.getCatalogShell();

  // For Phase 4 we keep the menu flat: top-level categories with all
  // brands shown as a flyout. Future phases can refine this with
  // category/brand affinity (only show brands that actually have
  // products in that category).
  const popularCategories = categories.filter((c) => c.parentId === null).slice(0, 8);
  return popularCategories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    brands: brands.slice(0, 12).map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
  }));
}

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const menu = await loadMenu();
  return (
    <>
      <Header menu={menu} />
      <main>
        <Container>{children}</Container>
      </main>
      <Footer />
    </>
  );
}
