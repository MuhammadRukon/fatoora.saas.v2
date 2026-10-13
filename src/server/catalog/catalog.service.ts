import { Prisma, PublishStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  BrandInput,
  CategoryInput,
  ProductInput,
  ProductListQuery,
  PublicProductDetail,
  PublicProductMetadata,
  PublicProductPage,
  PublicProductSummary,
  PublicProductVariant,
  productListQuerySchema,
  VariantInput,
} from '@/contracts/catalog';
import { buildKey, cacheDel, cached, stableHash } from '@/server/common/cache';
import { ConflictError, NotFoundError, ValidationError } from '@/server/common/errors';
import { applyDiscount } from '@/server/common/money';
import { slugify } from '@/server/common/slug';

import { catalogRepo } from './catalog.repo';
import { compareScored, scoreProduct } from './search-score';

/** Hard cap on rows fetched for in-memory relevance scoring (see `listPublicProducts`). */
const MAX_SEARCH_CANDIDATES = 500;

const SHELL_KEY = () => buildKey('cat', 'shell', 'v1');

const invalidatingShell = async <T>(p: Promise<T>): Promise<T> => {
  const r = await p;
  await cacheDel(SHELL_KEY());
  return r;
};

/**
 * Terms used to widen the candidate `where` clause for a search query: the
 * full query plus every 3-char sliding-window substring ("trigram") of each
 * token. A single edit (typo, missing letter, transposition) anywhere in a
 * word still leaves at least one unaffected trigram in common with the
 * correctly-spelled word, so the row reaches the in-memory scoring pass in
 * `search-score.ts` (which does the actual fuzzy-match scoring). Tokens
 * shorter than 3 chars are kept whole since they have no trigram.
 */
function candidateTerms(q: string): string[] {
  const normalized = q.trim().toLowerCase();
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  const terms = new Set<string>([normalized]);
  for (const t of tokens) {
    if (t.length < 3) {
      terms.add(t);
      continue;
    }
    for (let i = 0; i + 3 <= t.length; i++) {
      terms.add(t.slice(i, i + 3));
    }
  }
  return Array.from(terms).filter(Boolean);
}

interface VariantPricing {
  priceCents: number;
  originalPriceCents: number;
  inStock: boolean;
}

function pricingFromVariant(v: {
  sellingPriceCents: number;
  discountCents: number;
  stock: number;
  isActive: boolean;
}): VariantPricing {
  return {
    priceCents: applyDiscount(v.sellingPriceCents, v.discountCents),
    originalPriceCents: v.sellingPriceCents,
    inStock: v.isActive && v.stock > 0,
  };
}

/**
 * Shared by both `listPublicProducts` branches (ranked and newest/price).
 * Structural typing means either branch's Prisma select (the ranked branch
 * additionally selects `description`/`sku`) satisfies this shape.
 */
function toPublicProductSummary(p: {
  id: string;
  slug: string;
  name: string;
  isPopular: boolean;
  brand: { id: string; name: string; slug: string };
  images: { url: string }[];
  variants: { sellingPriceCents: number; discountCents: number; stock: number }[];
  _count: { variants: number };
}): PublicProductSummary {
  const variant = p.variants[0];
  const pricing = variant
    ? pricingFromVariant({
        sellingPriceCents: variant.sellingPriceCents,
        discountCents: variant.discountCents,
        stock: variant.stock,
        isActive: true,
      })
    : { priceCents: 0, originalPriceCents: 0, inStock: false };
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    imageUrl: p.images[0]?.url ?? null,
    priceCents: pricing.priceCents,
    originalPriceCents: pricing.originalPriceCents,
    inStock: p._count.variants > 0,
    isPopular: p.isPopular,
  };
}

function ensureUniqueSkus(variants: VariantInput[]) {
  const seen = new Set<string>();
  for (const v of variants) {
    if (seen.has(v.sku)) {
      throw new ValidationError('Duplicate SKU within product', { sku: v.sku });
    }
    seen.add(v.sku);
  }
}

function brandStatusOrDefault(input: BrandInput): PublishStatus {
  return input.status ?? PublishStatus.PUBLISHED;
}

function categoryStatusOrDefault(input: CategoryInput): PublishStatus {
  return input.status ?? PublishStatus.PUBLISHED;
}

function productStatusOrDefault(input: ProductInput): PublishStatus {
  return input.status ?? PublishStatus.DRAFT;
}

function uniqueConstraintField(err: Prisma.PrismaClientKnownRequestError): string {
  const target = err.meta?.target;
  if (Array.isArray(target)) return target[0] ?? 'field';
  return 'field';
}

export const catalogService = {
  // --- Brand ---------------------------------------------------------------

  listBrands() {
    return catalogRepo.listBrands();
  },

  async createBrand(input: BrandInput) {
    const slug = slugify(input.slug || input.name);
    try {
      return await invalidatingShell(catalogRepo.createBrand({
        name: input.name,
        slug,
        logoUrl: input.logoUrl ?? null,
        isPopular: input.isPopular ?? false,
        status: brandStatusOrDefault(input),
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(`A brand with this ${uniqueConstraintField(err)} already exists`);
      }
      throw err;
    }
  },

  async updateBrand(id: string, input: BrandInput) {
    const slug = slugify(input.slug || input.name);
    try {
      return await invalidatingShell(catalogRepo.updateBrand(id, {
        name: input.name,
        slug,
        logoUrl: input.logoUrl ?? null,
        isPopular: input.isPopular ?? false,
        status: brandStatusOrDefault(input),
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictError(`A brand with this ${uniqueConstraintField(err)} already exists`);
        }
        if (err.code === 'P2025') throw new NotFoundError('Brand');
      }
      throw err;
    }
  },

  async deleteBrand(id: string) {
    try {
      await invalidatingShell(catalogRepo.deleteBrand(id));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundError('Brand');
        if (err.code === 'P2003') {
          throw new ConflictError(
            'This brand has products attached. Archive it instead of deleting.',
          );
        }
      }
      throw err;
    }
  },

  // --- Category ------------------------------------------------------------

  listCategories() {
    return catalogRepo.listCategories();
  },

  async createCategory(input: CategoryInput) {
    const slug = slugify(input.slug || input.name);
    try {
      return await invalidatingShell(catalogRepo.createCategory({
        name: input.name,
        slug,
        iconUrl: input.iconUrl ?? null,
        isPopular: input.isPopular ?? false,
        status: categoryStatusOrDefault(input),
        parent: input.parentId ? { connect: { id: input.parentId } } : undefined,
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          `A category with this ${uniqueConstraintField(err)} already exists`,
        );
      }
      throw err;
    }
  },

  async updateCategory(id: string, input: CategoryInput) {
    const slug = slugify(input.slug || input.name);
    try {
      return await invalidatingShell(catalogRepo.updateCategory(id, {
        name: input.name,
        slug,
        iconUrl: input.iconUrl ?? null,
        isPopular: input.isPopular ?? false,
        status: categoryStatusOrDefault(input),
        parent: input.parentId ? { connect: { id: input.parentId } } : { disconnect: true },
      }));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictError(
            `A category with this ${uniqueConstraintField(err)} already exists`,
          );
        }
        if (err.code === 'P2025') throw new NotFoundError('Category');
      }
      throw err;
    }
  },

  async deleteCategory(id: string) {
    try {
      await invalidatingShell(catalogRepo.deleteCategory(id));
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundError('Category');
        if (err.code === 'P2003') {
          throw new ConflictError(
            'This category has products attached. Archive it instead of deleting.',
          );
        }
      }
      throw err;
    }
  },

  // --- Product -------------------------------------------------------------

  listProducts() {
    return catalogRepo.listProductsAdmin();
  },

  async getProduct(id: string) {
    const product = await catalogRepo.findProduct(id);
    if (!product) throw new NotFoundError('Product');
    return product;
  },

  /**
   * Create a product together with its variants, images, and category links
   * in a single transaction. Failure rolls everything back so we never end
   * up with a half-saved product.
   */
  async createProduct(input: ProductInput) {
    ensureUniqueSkus(input.variants);
    const slug = slugify(input.slug || input.name);
    try {
      return await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            name: input.name,
            slug,
            description: input.description,
            brandId: input.brandId,
            status: productStatusOrDefault(input),
            isPopular: input.isPopular ?? false,
            warrantyMonths: input.warrantyMonths,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
            categories: {
              create: input.categoryIds.map((categoryId) => ({ categoryId })),
            },
            images: {
              create: input.images.map((img, idx) => ({
                url: img.url,
                publicId: img.publicId,
                alt: img.alt ?? null,
                sortOrder: img.sortOrder ?? idx,
              })),
            },
            variants: {
              create: input.variants.map((v) => ({
                sku: v.sku,
                name: v.name ?? null,
                attributes: v.attributes ?? {},
                buyingPriceCents: v.buyingPriceCents,
                sellingPriceCents: v.sellingPriceCents,
                discountCents: v.discountCents,
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
                isActive: v.isActive,
              })),
            },
          },
        });
        return product;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const field = uniqueConstraintField(err);
        if (field.toLowerCase().includes('sku')) {
          throw new ConflictError('SKU already in use', { field });
        }
        throw new ConflictError(`A product with this ${field} already exists`);
      }
      throw err;
    }
  },

  /**
   * Update product metadata + replace images / variants. Variants matched
   * by id are updated; new variants are created; missing ids that are
   * referenced by orders are deactivated rather than deleted (so the
   * historical FK from `OrderItem.variantId` stays valid).
   */
  async updateProduct(id: string, input: ProductInput) {
    ensureUniqueSkus(input.variants);
    const slug = slugify(input.slug || input.name);

    const existing = await catalogRepo.findProduct(id);
    if (!existing) throw new NotFoundError('Product');

    const incomingVariantIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id!));
    const removedVariants = existing.variants.filter((v) => !incomingVariantIds.has(v.id));

    try {
      return await prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name: input.name,
            slug,
            description: input.description,
            brandId: input.brandId,
            status: productStatusOrDefault(input),
            isPopular: input.isPopular ?? false,
            warrantyMonths: input.warrantyMonths,
            metaTitle: input.metaTitle ?? null,
            metaDescription: input.metaDescription ?? null,
          },
        });

        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (input.categoryIds.length > 0) {
          await tx.productCategory.createMany({
            data: input.categoryIds.map((categoryId) => ({ productId: id, categoryId })),
          });
        }

        await tx.productImage.deleteMany({ where: { productId: id } });
        if (input.images.length > 0) {
          await tx.productImage.createMany({
            data: input.images.map((img, idx) => ({
              productId: id,
              url: img.url,
              publicId: img.publicId,
              alt: img.alt ?? null,
              sortOrder: img.sortOrder ?? idx,
            })),
          });
        }

        for (const v of input.variants) {
          if (v.id) {
            await tx.productVariant.update({
              where: { id: v.id },
              data: {
                sku: v.sku,
                name: v.name ?? null,
                attributes: v.attributes ?? {},
                buyingPriceCents: v.buyingPriceCents,
                sellingPriceCents: v.sellingPriceCents,
                discountCents: v.discountCents,
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
                isActive: v.isActive,
              },
            });
          } else {
            await tx.productVariant.create({
              data: {
                productId: id,
                sku: v.sku,
                name: v.name ?? null,
                attributes: v.attributes ?? {},
                buyingPriceCents: v.buyingPriceCents,
                sellingPriceCents: v.sellingPriceCents,
                discountCents: v.discountCents,
                stock: v.stock,
                lowStockThreshold: v.lowStockThreshold,
                isActive: v.isActive,
              },
            });
          }
        }

        for (const removed of removedVariants) {
          const refCount = await tx.orderItem.count({ where: { variantId: removed.id } });
          if (refCount > 0) {
            await tx.productVariant.update({
              where: { id: removed.id },
              data: { isActive: false },
            });
          } else {
            await tx.productVariant.delete({ where: { id: removed.id } });
          }
        }

        return tx.product.findUnique({
          where: { id },
          include: catalogRepo.productInclude,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const field = uniqueConstraintField(err);
        if (field.toLowerCase().includes('sku')) {
          throw new ConflictError('SKU already in use', { field });
        }
        throw new ConflictError(`A product with this ${field} already exists`);
      }
      throw err;
    }
  },

  // --- Public storefront ---------------------------------------------------

  /** Categories + brands for the storefront menu/sidebars, one cache entry. */
  async getCatalogShell() {
    return cached({ key: SHELL_KEY(), ttlSec: 300 }, async () => {
      const [categories, brands] = await Promise.all([this.listPublicCategories(), this.listPublicBrands()]);
      return { categories, brands };
    });
  },

  async listPublicCategories() {
    return prisma.category.findMany({
      where: { status: PublishStatus.PUBLISHED },
      orderBy: [{ isPopular: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, parentId: true, isPopular: true },
    });
  },

  async listPublicBrands() {
    return prisma.brand.findMany({
      where: { status: PublishStatus.PUBLISHED },
      orderBy: [{ isPopular: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, isPopular: true },
    });
  },

  /**
   * Build the Where clause for a public product query, sharing the
   * status filter, full-text search, and category/brand selection.
   */
  buildPublicProductWhere(query: ProductListQuery): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {
      status: PublishStatus.PUBLISHED,
    };
    if (query.q) {
      const terms = candidateTerms(query.q);
      const mode = Prisma.QueryMode.insensitive;
      where.OR = [
        { description: { contains: query.q, mode } },
        ...terms.flatMap((t): Prisma.ProductWhereInput[] => [
          { name: { contains: t, mode } },
          { brand: { is: { name: { contains: t, mode } } } },
          { variants: { some: { sku: { contains: t, mode } } } },
        ]),
      ];
    }
    if (query.brandSlug) {
      where.brand = { slug: query.brandSlug };
    }
    if (query.categorySlug) {
      where.categories = {
        some: { category: { slug: query.categorySlug } },
      };
    }
    if (query.inStock) {
      where.variants = { some: { isActive: true, stock: { gt: 0 } } };
    }
    return where;
  },

  /**
   * When `q` is present, ranks by relevance instead of the newest/price
   * sort: fetch up to `MAX_SEARCH_CANDIDATES` matching rows, score each in
   * memory (see `search-score.ts`), drop non-matches, then rank and
   * paginate. Explicit price sorts still override relevance ordering.
   * Upgrade path if the catalog outgrows this: Postgres full-text search
   * or pg_trgm similarity, both of which need a migration + raw SQL.
   */
  async listPublicProducts(query: ProductListQuery): Promise<PublicProductPage> {
    const parsed = productListQuerySchema.safeParse(query);
    if (!parsed.success) return this.loadPublicProducts(query);
    const { q: rawQ, ...rest } = parsed.data;
    const q = rawQ?.trim().toLowerCase().replace(/\s+/g, ' ');
    const canonical: ProductListQuery = {
      ...rest,
      ...(q ? { q } : {}),
      page: rest.page ?? 1,
      limit: rest.limit ?? 12,
      sort: rest.sort ?? 'newest',
    };
    // shortcut: TTL-only invalidation, <=60-120s stale, upgrade to a version key if admins need instant search updates
    // bump v1 when the cached DTO shape changes (entries live 60-300s)
    return cached(
      {
        key: buildKey('cat', q ? 'search' : 'list', 'v1', stableHash(canonical)),
        ttlSec: q ? 120 : 60,
        ttlFor: (page) => (page.items.length === 0 ? 30 : q ? 120 : 60),
      },
      () => this.loadPublicProducts(canonical),
    );
  },

  async loadPublicProducts(query: ProductListQuery): Promise<PublicProductPage> {
    const pageSize = Math.min(60, Math.max(1, query.limit ?? 12));
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * pageSize;
    const sort = query.sort ?? 'newest';

    const where = this.buildPublicProductWhere(query);

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.variants = {
        ...(where.variants ?? {}),
        some: {
          ...(typeof where.variants === 'object' && where.variants && 'some' in where.variants
            ? where.variants.some
            : {}),
          isActive: true,
          ...(query.minPrice !== undefined ? { sellingPriceCents: { gte: query.minPrice } } : {}),
          ...(query.maxPrice !== undefined ? { sellingPriceCents: { lte: query.maxPrice } } : {}),
        },
      };
    }

    if (query.q) {
      const q = query.q;
      const rows = await prisma.product.findMany({
        where,
        take: MAX_SEARCH_CANDIDATES,
        select: {
          id: true,
          createdAt: true,
          slug: true,
          name: true,
          description: true,
          isPopular: true,
          brand: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: {
            where: { isActive: true },
            orderBy: { sellingPriceCents: 'asc' },
            select: {
              sku: true,
              sellingPriceCents: true,
              discountCents: true,
              stock: true,
            },
          },
          _count: {
            select: {
              variants: {
                where: {
                  isActive: true,
                  stock: { gt: 0 },
                },
              },
            },
          },
        },
      });

      const scored = rows
        .map((row) => ({
          row,
          score: scoreProduct(q, {
            name: row.name,
            brandName: row.brand.name,
            skus: row.variants.map((v) => v.sku),
            description: row.description,
            isPopular: row.isPopular,
            createdAt: row.createdAt,
          }),
        }))
        .filter((s) => s.score > 0);

      const rankedRows =
        sort === 'price_asc' || sort === 'price_desc'
          ? scored
              .slice()
              .sort((a, b) => {
                const aPrice = a.row.variants[0]?.sellingPriceCents ?? Number.POSITIVE_INFINITY;
                const bPrice = b.row.variants[0]?.sellingPriceCents ?? Number.POSITIVE_INFINITY;
                if (aPrice === bPrice) return b.row.createdAt.getTime() - a.row.createdAt.getTime();
                return sort === 'price_asc' ? aPrice - bPrice : bPrice - aPrice;
              })
              .map((s) => s.row)
          : scored
              .slice()
              .sort((a, b) =>
                compareScored(
                  { score: a.score, isPopular: a.row.isPopular, createdAt: a.row.createdAt },
                  { score: b.score, isPopular: b.row.isPopular, createdAt: b.row.createdAt },
                ),
              )
              .map((s) => s.row);

      const total = rankedRows.length;
      const items = rankedRows.slice(skip, skip + pageSize).map(toPublicProductSummary);

      return { items, total, page, pageSize };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        select: {
          id: true,
          createdAt: true,
          slug: true,
          name: true,
          isPopular: true,
          brand: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: {
            where: { isActive: true },
            orderBy: { sellingPriceCents: 'asc' },
            take: 1,
            select: {
              sellingPriceCents: true,
              discountCents: true,
              stock: true,
            },
          },
          _count: {
            select: {
              variants: {
                where: {
                  isActive: true,
                  stock: { gt: 0 },
                },
              },
            },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    const sortedRows =
      sort === 'newest'
        ? rows
        : [...rows].sort((a, b) => {
            const aPrice = a.variants[0]?.sellingPriceCents ?? Number.POSITIVE_INFINITY;
            const bPrice = b.variants[0]?.sellingPriceCents ?? Number.POSITIVE_INFINITY;

            if (aPrice === bPrice) {
              return b.createdAt.getTime() - a.createdAt.getTime();
            }

            return sort === 'price_asc' ? aPrice - bPrice : bPrice - aPrice;
          });

    const items: PublicProductSummary[] = sortedRows.map(toPublicProductSummary);

    return { items, total, page, pageSize };
  },

  async getPublicProductBySlug(slug: string): Promise<PublicProductDetail> {
    const product = await prisma.product.findFirst({
      where: { slug, status: PublishStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        warrantyMonths: true,
        metaTitle: true,
        metaDescription: true,
        brand: { select: { id: true, name: true, slug: true } },
        categories: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
          select: { url: true, alt: true },
        },
        variants: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            sku: true,
            name: true,
            attributes: true,
            sellingPriceCents: true,
            discountCents: true,
            stock: true,
            isActive: true,
          },
        },
      },
    });
    if (!product) {
      throw new NotFoundError('Product');
    }

    const variants: PublicProductVariant[] = product.variants.map((v) => {
      const p = pricingFromVariant(v);
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        attributes: (v.attributes as Record<string, string>) ?? {},
        priceCents: p.priceCents,
        originalPriceCents: p.originalPriceCents,
        inStock: p.inStock,
      };
    });

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      warrantyMonths: product.warrantyMonths,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      brand: product.brand,
      categories: product.categories.map((c) => c.category),
      images: product.images.map((i) => ({ url: i.url, alt: i.alt })),
      variants,
    };
  },

  // async getPublicProductMetadataBySlug(slug: string): Promise<PublicProductMetadata> {
  //   const product = await prisma.product.findUnique({
  //     where: { slug },
  //     select: {
  //       slug: true,
  //       name: true,
  //       metaTitle: true,
  //       metaDescription: true,
  //       status: true,
  //       images: {
  //         orderBy: { sortOrder: 'asc' },
  //         take: 1,
  //         select: { url: true },
  //       },
  //     },
  //   });
  //   if (!product || product.status !== PublishStatus.PUBLISHED) {
  //     throw new NotFoundError('Product');
  //   }

  //   return {
  //     slug: product.slug,
  //     name: product.name,
  //     metaTitle: product.metaTitle,
  //     metaDescription: product.metaDescription,
  //     imageUrl: product.images[0]?.url ?? null,
  //   };
  // },

  /**
   * Delete only when the product has never been part of an order. Otherwise
   * archive it so historical orders keep working.
   */
  async deleteProduct(id: string) {
    const refs = await prisma.orderItem.count({ where: { productId: id } });
    if (refs > 0) {
      await prisma.product.update({
        where: { id },
        data: { status: PublishStatus.ARCHIVED },
      });
      return { archived: true as const };
    }
    try {
      await prisma.product.delete({ where: { id } });
      return { archived: false as const };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Product');
      }
      throw err;
    }
  },
};
