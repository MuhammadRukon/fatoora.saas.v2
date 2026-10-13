import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Catalog persistence boundary. Thin wrappers around Prisma so that
 * the service layer reads like business rules, not database queries.
 */
export const catalogRepo = {
  // --- Brand ---------------------------------------------------------------

  listBrands(args: { onlyPublished?: boolean } = {}) {
    return prisma.brand.findMany({
      where: args.onlyPublished ? { status: 'PUBLISHED' } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  },
  findBrand(id: string) {
    return prisma.brand.findUnique({ where: { id } });
  },
  createBrand(data: Prisma.BrandCreateInput) {
    return prisma.brand.create({ data });
  },
  updateBrand(id: string, data: Prisma.BrandUpdateInput) {
    return prisma.brand.update({ where: { id }, data });
  },
  deleteBrand(id: string) {
    return prisma.brand.delete({ where: { id } });
  },

  // --- Category ------------------------------------------------------------

  listCategories(args: { onlyPublished?: boolean } = {}) {
    return prisma.category.findMany({
      where: args.onlyPublished ? { status: 'PUBLISHED' } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  },
  findCategory(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },
  createCategory(data: Prisma.CategoryCreateInput) {
    return prisma.category.create({ data });
  },
  updateCategory(id: string, data: Prisma.CategoryUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },
  deleteCategory(id: string) {
    return prisma.category.delete({ where: { id } });
  },

  // --- Product -------------------------------------------------------------

  productInclude: {
    brand: true,
    categories: { include: { category: true } },
    images: { orderBy: { sortOrder: 'asc' } },
    variants: true,
  } satisfies Prisma.ProductInclude,

  listProductsAdmin() {
    return prisma.product.findMany({
      include: {
        brand: { select: { id: true, name: true } },
        categories: { include: { category: { select: { id: true, name: true } } } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  findProduct(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: this.productInclude,
    });
  },

  prisma,
};

export type AdminProductRow = Prisma.PromiseReturnType<
  typeof catalogRepo.listProductsAdmin
>[number];

export type AdminProduct = NonNullable<Prisma.PromiseReturnType<typeof catalogRepo.findProduct>>;

export function findUser(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

export type AdminUser = NonNullable<Prisma.PromiseReturnType<typeof findUser>>;
