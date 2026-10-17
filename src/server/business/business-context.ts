import { prisma } from '@/lib/prisma';
import { BusinessRequiredError } from '@/server/common/errors';

/**
 * The business every /api/app query is scoped to. This (with business.service)
 * is the only place `ownerId` is read for scoping.
 *
 * v1: a user owns at most one business, so this returns it. Multi-business later:
 * take the requested id (an `x-business-id` header) as a second argument and
 * validate it against a membership table here; callers don't change.
 */
export async function resolveBusinessId(userId: string): Promise<string> {
  const business = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!business) throw new BusinessRequiredError();
  return business.id;
}
