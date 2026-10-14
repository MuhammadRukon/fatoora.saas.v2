import { businessUpsertSchema, type BusinessUpsertInput } from '@/contracts/business';
import { prisma } from '@/lib/prisma';

/** A valid business body (plan AC3.1 values). */
export const validBusiness = (overrides: Partial<BusinessUpsertInput> = {}): BusinessUpsertInput => ({
  nameEn: 'Test Co',
  nameAr: 'شركة',
  vatNumber: '300000000000003',
  sellerIdScheme: 'CRN',
  sellerIdValue: '1010010000',
  street: 'King Fahd Road',
  buildingNumber: '1234',
  district: 'Al Olaya',
  city: 'Riyadh',
  postalCode: '12345',
  businessCategory: 'Retail',
  ...overrides,
});

/** The same body parsed, as the service receives it. */
export const businessData = (overrides: Partial<BusinessUpsertInput> = {}) =>
  businessUpsertSchema.parse(validBusiness(overrides));

/**
 * Tracks users created by a test file and deletes them (with their businesses,
 * EGS units and customers; the FKs restrict, so children go first).
 */
export function testUsers(prefix: string) {
  const ids: string[] = [];
  return {
    async create(role: 'USER' | 'ADMIN' = 'USER') {
      const user = await prisma.user.create({
        data: { name: 'Test', email: `${prefix}-${Math.random()}@example.test`, role },
      });
      ids.push(user.id);
      return user;
    },
    async cleanup() {
      const userIds = ids.splice(0);
      // Relation filter, not the raw column: scoping by owner stays in business-context (AC3.6 grep).
      const owned = { owner: { id: { in: userIds } } };
      await prisma.document.deleteMany({ where: { business: owned } }); // lines cascade
      await prisma.customer.deleteMany({ where: { business: owned } });
      await prisma.egsUnit.deleteMany({ where: { business: owned } });
      await prisma.business.deleteMany({ where: owned });
      await prisma.subscription.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    },
  };
}
