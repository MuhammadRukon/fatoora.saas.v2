import { Prisma, type Customer } from '@prisma/client';

import type { CustomerData, CustomerListQuery } from '@/contracts/customers';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/server/common/errors';
import { clampLimit, type CursorPage } from '@/server/common/pagination';

/** P2025 (no row matched id + businessId) → 404, so other businesses' ids don't leak. */
function mapWriteError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') throw new NotFoundError('Customer');
    // Documents reference customers with onDelete: Restrict (Phase 4).
    if (err.code === 'P2003') {
      throw new ConflictError('Customer is used by documents (CUSTOMER_HAS_DOCUMENTS)');
    }
  }
  throw err;
}

/** Every query is scoped by businessId (from resolveBusinessId, never from the client). */
export const customersService = {
  async list(businessId: string, { q, cursor, limit }: CustomerListQuery): Promise<CursorPage<Customer>> {
    const take = clampLimit(limit);
    const where: Prisma.CustomerWhereInput = { businessId };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameAr: { contains: q } },
        { vatNumber: { contains: q } },
      ];
    }
    const rows = await prisma.customer.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take);
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  },

  async get(businessId: string, id: string) {
    const customer = await prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundError('Customer');
    return customer;
  },

  create(businessId: string, data: CustomerData) {
    return prisma.customer.create({ data: { ...data, businessId } });
  },

  update(businessId: string, id: string, data: CustomerData) {
    return prisma.customer.update({ where: { id, businessId }, data }).catch(mapWriteError);
  },

  async remove(businessId: string, id: string) {
    await prisma.customer.delete({ where: { id, businessId } }).catch(mapWriteError);
  },
};
