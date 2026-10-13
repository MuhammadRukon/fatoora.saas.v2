import { beforeEach, describe, expect, it, vi } from 'vitest';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

import { revalidateCatalog, revalidateProductPage } from '@/app/api/_lib/revalidate';

beforeEach(() => vi.clearAllMocks());

describe('revalidateCatalog', () => {
  it('purges the layout only with menu: true', () => {
    revalidateCatalog({ productSlug: 'a' });
    expect(revalidatePath).not.toHaveBeenCalledWith('/', 'layout');
    vi.clearAllMocks();
    revalidateCatalog({ menu: true });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('revalidateProductPage purges only that PDP', () => {
    revalidateProductPage('a');
    expect(revalidatePath.mock.calls).toEqual([['/products/a']]);
  });

  it('purges the default listing pages and the PDP', () => {
    revalidateCatalog({ productSlug: 'a', previousSlug: 'b' });
    const calls = revalidatePath.mock.calls.map((c) => c.join('|'));
    expect(calls).toEqual(
      expect.arrayContaining([
        '/products/a',
        '/products/b',
        '/products',
        '/category/[slug]|page',
        '/brand/[slug]|page',
        '/',
        '/sitemap.xml',
      ]),
    );
  });
});
