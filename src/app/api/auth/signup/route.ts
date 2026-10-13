import { NextResponse } from 'next/server';

import { signupSchema } from '@/contracts/auth';
import { authService } from '@/server/auth/auth.service';
import { jsonError } from '@/server/common/http';
import { clientIp, enforceRateLimit } from '@/server/common/rate-limit';

export async function POST(request: Request) {
  try {
    await enforceRateLimit(`signup:${clientIp(request)}`, { max: 5, windowMs: 15 * 60 * 1000 });
    const body = (await request.json()) as unknown;
    const input = signupSchema.parse(body);
    const user = await authService.signup(input);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
