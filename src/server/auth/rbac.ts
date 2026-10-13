import { ForbiddenError, UnauthorizedError } from '@/server/common/errors';
import type { UserRole } from '@prisma/client';

export interface SessionUserLike {
  id: string;
  role: UserRole;
}

export function requireUser<T extends SessionUserLike | null | undefined>(user: T): NonNullable<T> {
  if (!user) {
    throw new UnauthorizedError();
  }
  return user as NonNullable<T>;
}

export function requireAdmin<T extends SessionUserLike | null | undefined>(user: T): NonNullable<T> {
  const u = requireUser(user);
  if ((u as SessionUserLike).role !== 'ADMIN') {
    throw new ForbiddenError('Admin role required');
  }
  return u;
}
