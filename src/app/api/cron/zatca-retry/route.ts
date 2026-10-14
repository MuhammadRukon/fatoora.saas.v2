import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { env } from '@/env';
import { issuanceService } from '@/server/documents/issuance.service';
import { jsonError } from '@/server/common/http';

// Not under /api/app: no session, only the shared secret Vercel Cron sends as a Bearer token.
function authorized(request: Request) {
  const secret = env.CRON_SECRET;
  const given = request.headers.get('authorization') ?? '';
  if (!secret) return false; // unset (dev): fail closed
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await issuanceService.retryPending());
  } catch (err) {
    return jsonError(err);
  }
}
