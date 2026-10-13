import type { BusinessUpsertData } from '@/contracts/business';
import { prisma } from '@/lib/prisma';
import { ConflictError } from '@/server/common/errors';

export const businessService = {
  /** The user's business profile, or null before setup. */
  getMine(userId: string) {
    return prisma.business.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
  },

  /** Creates the profile on first save (v1: one business per user), otherwise updates it. */
  upsertMine(userId: string, data: BusinessUpsertData) {
    return prisma.$transaction(async (tx) => {
      // Lock the owner row so concurrent first saves can't create two businesses.
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const existing = await tx.business.findFirst({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
      });
      if (!existing) return tx.business.create({ data: { ...data, ownerId: userId } });

      const changesLocked =
        data.vatNumber !== existing.vatNumber ||
        (data.zatcaEnvironment !== undefined && data.zatcaEnvironment !== existing.zatcaEnvironment);
      // Onboarded EGS certificates are bound to the VAT number and the ZATCA environment.
      if (changesLocked) {
        const activeEgs = await tx.egsUnit.count({ where: { businessId: existing.id, status: 'ACTIVE' } });
        if (activeEgs) {
          throw new ConflictError(
            'VAT number and ZATCA environment are locked after onboarding (BUSINESS_LOCKED_FIELDS)',
          );
        }
      }
      return tx.business.update({ where: { id: existing.id }, data });
    });
  },
};
