/**
 * Live-DB test (same tradeoff as orders.service.test.ts: no Prisma-mocking
 * convention exists in this repo, so this runs against the DATABASE_URL
 * database). Fixtures are randomised per test and cleaned up after.
 */
import { PublishStatus } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';

import { catalogService } from '../catalog.service';

const TEST_TIMEOUT = 60_000;

const createdProductIds: string[] = [];
const createdBrandIds: string[] = [];

afterEach(async () => {
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds.splice(0) } } });
  await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds.splice(0) } } });
}, TEST_TIMEOUT);

describe('catalogService.listPublicProducts (relevance ranking)', () => {
  it(
    'ranks a name match above a description-only match for the same query',
    async () => {
      const suffix = Math.random().toString(36).slice(2, 10);
      const term = `Zyxphone${suffix}`;

      const brand = await prisma.brand.create({
        data: { slug: `search-test-brand-${suffix}`, name: `Search Test Brand ${suffix}` },
      });
      createdBrandIds.push(brand.id);

      const nameMatch = await prisma.product.create({
        data: {
          slug: `search-test-name-${suffix}`,
          name: `${term} Pro`,
          description: 'A flagship device.',
          brandId: brand.id,
          status: PublishStatus.PUBLISHED,
          variants: {
            create: [
              {
                sku: `SEARCH-NAME-${suffix}`,
                buyingPriceCents: 50_000,
                sellingPriceCents: 100_000,
                stock: 5,
              },
            ],
          },
        },
      });
      createdProductIds.push(nameMatch.id);

      const descriptionMatch = await prisma.product.create({
        data: {
          slug: `search-test-desc-${suffix}`,
          name: `Accessory Cable ${suffix}`,
          description: `Works great with ${term} devices.`,
          brandId: brand.id,
          status: PublishStatus.PUBLISHED,
          variants: {
            create: [
              {
                sku: `SEARCH-DESC-${suffix}`,
                buyingPriceCents: 5_000,
                sellingPriceCents: 10_000,
                stock: 5,
              },
            ],
          },
        },
      });
      createdProductIds.push(descriptionMatch.id);

      const page = await catalogService.listPublicProducts({ q: term });

      expect(page.items.length).toBe(2);
      expect(page.items[0].slug).toBe(nameMatch.slug);
      expect(page.items[1].slug).toBe(descriptionMatch.slug);
      expect(page.items[0].priceCents).toBe(100_000);
      expect(page.items[0].inStock).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'finds a product when the query drops an internal letter (typo, not just a trailing one)',
    async () => {
      const suffix = Math.random().toString(36).slice(2, 10);
      const term = `Wobbulator${suffix}`;
      const mid = Math.floor(term.length / 2);
      const typoQuery = term.slice(0, mid) + term.slice(mid + 1);

      const brand = await prisma.brand.create({
        data: { slug: `search-typo-brand-${suffix}`, name: `Search Typo Brand ${suffix}` },
      });
      createdBrandIds.push(brand.id);

      const product = await prisma.product.create({
        data: {
          slug: `search-typo-product-${suffix}`,
          name: `${term} Speaker`,
          description: 'A test fixture product.',
          brandId: brand.id,
          status: PublishStatus.PUBLISHED,
          variants: {
            create: [
              {
                sku: `SEARCH-TYPO-${suffix}`,
                buyingPriceCents: 20_000,
                sellingPriceCents: 40_000,
                stock: 3,
              },
            ],
          },
        },
      });
      createdProductIds.push(product.id);

      const page = await catalogService.listPublicProducts({ q: typoQuery });

      expect(page.items.some((i) => i.slug === product.slug)).toBe(true);
    },
    TEST_TIMEOUT,
  );
});
