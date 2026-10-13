import { Prisma } from '@prisma/client';

import type { AdminUserCreateInput, AdminUserUpdateInput } from '@/contracts/admin-users';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError } from '@/server/common/errors';
import { hashPassword } from '@/server/auth/password';

function sanitizePhone(phone: string | null | undefined): string | null {
  return phone?.trim() ? phone.trim() : null;
}

function sanitizeImage(image: string | null | undefined): string | null {
  return image?.trim() ? image.trim() : null;
}

const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  emailVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type AdminUser = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export const usersService = {
  listAdminUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: adminUserSelect,
    });
  },

  async createAdminUser(input: AdminUserCreateInput) {
    try {
      return await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: sanitizePhone(input.phone),
          image: sanitizeImage(input.image),
          role: input.role,
          passwordHash: input.password ? await hashPassword(input.password) : null,
        },
        select: adminUserSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('A user with this email already exists', { field: 'email' });
      }
      throw err;
    }
  },

  async updateAdminUser(id: string, input: AdminUserUpdateInput) {
    try {
      return await prisma.user.update({
        where: { id },
        data: {
          name: input.name,
          phone: sanitizePhone(input.phone),
          image: sanitizeImage(input.image),
          role: input.role,
        },
        select: adminUserSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('User');
      }
      throw err;
    }
  },
};
