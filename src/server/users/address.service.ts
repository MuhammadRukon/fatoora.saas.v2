import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { AddressInput } from '@/contracts/address';
import { ConflictError, NotFoundError } from '@/server/common/errors';

export const addressService = {
  list(userId: string) {
    return prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  get(userId: string, id: string) {
    return prisma.address.findFirst({ where: { id, userId } });
  },

  async create(userId: string, input: AddressInput) {
    const existingCount = await prisma.address.count({ where: { userId } });
    const isDefault = input.isDefault ?? existingCount === 0;
    return prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.create({
        data: {
          userId,
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          line1: input.line1,
          line2: input.line2 ?? null,
          city: input.city,
          district: input.district ?? null,
          postalCode: input.postalCode ?? null,
          country: input.country,
          isDefault,
        },
      });
    });
  },

  async update(userId: string, id: string, input: AddressInput) {
    const existing = await this.get(userId, id);
    if (!existing) throw new NotFoundError('Address');
    return prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id },
        data: {
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          line1: input.line1,
          line2: input.line2 ?? null,
          city: input.city,
          district: input.district ?? null,
          postalCode: input.postalCode ?? null,
          country: input.country,
          isDefault: input.isDefault ?? existing.isDefault,
        },
      });
    });
  },

  async remove(userId: string, id: string) {
    const existing = await this.get(userId, id);
    if (!existing) throw new NotFoundError('Address');
    try {
      await prisma.address.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new ConflictError(
          'This address is referenced by past orders and cannot be deleted.',
        );
      }
      throw err;
    }
  },
};
