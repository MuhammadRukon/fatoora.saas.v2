import { describe, expect, it } from 'vitest';

import { ForbiddenError, UnauthorizedError } from '@/server/common/errors';

import { requireAdmin, requireUser } from '../rbac';

describe('rbac: requireUser', () => {
  it('throws UnauthorizedError for null/undefined', () => {
    expect(() => requireUser(null)).toThrow(UnauthorizedError);
    expect(() => requireUser(undefined)).toThrow(UnauthorizedError);
  });

  it('returns the user when present', () => {
    const user = { id: 'u1', role: 'CUSTOMER' as const };
    expect(requireUser(user)).toBe(user);
  });
});

describe('rbac: requireAdmin', () => {
  it('throws UnauthorizedError when no user', () => {
    expect(() => requireAdmin(null)).toThrow(UnauthorizedError);
  });

  it('throws ForbiddenError for a non-admin user', () => {
    expect(() => requireAdmin({ id: 'u1', role: 'CUSTOMER' })).toThrow(ForbiddenError);
  });

  it('returns the user for an admin', () => {
    const admin = { id: 'a1', role: 'ADMIN' as const };
    expect(requireAdmin(admin)).toBe(admin);
  });
});
