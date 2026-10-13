import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { auth } from '@/auth';
import { ForbiddenError, UnauthorizedError, statusFromError, toJsonError } from './errors';
import { log } from './logger';
import { RateLimitedError } from './rate-limit';

/**
 * HTTP transport helpers. These are the *only* places allowed to
 * import `next/server`. Services stay framework-agnostic.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'CUSTOMER';
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    name: session.user.name ?? '',
    role: session.user.role,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdminSession(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'ADMIN') throw new ForbiddenError('Admin role required');
  return user;
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof RateLimitedError) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: err.message },
      { status: 429, headers: { 'Retry-After': String(err.retryAfter) } },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid payload',
        meta: { issues: err.issues },
      },
      { status: 422 },
    );
  }
  const status = statusFromError(err);
  if (status >= 500) {
    log.error('http.unhandled', { error: err instanceof Error ? err.message : String(err) });
  }
  return NextResponse.json(toJsonError(err), { status });
}
