/**
 * Unicode-safe slugifier. Lowercases, strips diacritics, collapses
 * non-alphanumerics to single hyphens, trims hyphens from edges.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
