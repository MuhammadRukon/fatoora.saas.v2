import { NextResponse } from 'next/server';

import { resetPasswordSchema } from '@/contracts/auth';
import { authService } from '@/server/auth/auth.service';
import { jsonError } from '@/server/common/http';
import { clientIp, enforceRateLimit } from '@/server/common/rate-limit';

export async function POST(request: Request) {
  try {
    await enforceRateLimit(`reset:${clientIp(request)}`, { max: 10, windowMs: 60 * 60 * 1000 });
    const body = (await request.json()) as unknown;
    const input = resetPasswordSchema.parse(body);
    await authService.resetPassword(input);
    return NextResponse.json({ message: 'Password updated' });
  } catch (err) {
    return jsonError(err);
  }
}
