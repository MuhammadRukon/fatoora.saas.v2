import { revalidatePath } from 'next/cache';

/**
 * Purge ISR output after an admin catalog write. Only call after the service
 * call succeeded. This is the only file allowed to import `next/cache`.
 */
export function revalidateCatalog({
  productSlug,
  previousSlug,
  menu = false,
}: { productSlug?: string; previousSlug?: string; menu?: boolean } = {}): void {
  for (const slug of new Set([productSlug, previousSlug])) {
    if (slug) revalidatePath(`/products/${slug}`);
  }
  revalidatePath('/');
  revalidatePath('/products');
  revalidatePath('/category/[slug]', 'page');
  revalidatePath('/brand/[slug]', 'page');
  if (menu) revalidatePath('/', 'layout'); // brand/category names live in the shared layout menu
  revalidatePath('/sitemap.xml');
}

export function revalidateProductPage(slug: string): void {
  revalidatePath(`/products/${slug}`);
}
