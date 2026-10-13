import { NextResponse } from 'next/server';

import { forgotPasswordSchema } from '@/contracts/auth';
import { authService } from '@/server/auth/auth.service';
import { jsonError } from '@/server/common/http';
import { clientIp, enforceRateLimit } from '@/server/common/rate-limit';

export async function POST(request: Request) {
  try {
    // Tight bucket since this triggers email sends + DB writes.
    await enforceRateLimit(`forgot:${clientIp(request)}`, { max: 5, windowMs: 60 * 60 * 1000 });
    const body = (await request.json()) as unknown;
    const input = forgotPasswordSchema.parse(body);
    const result = await authService.issuePasswordReset(input);

    // In dev we expose the raw token in the response so the link is
    // testable without an email provider configured. In production this
    // branch is replaced by an email send and the response is always
    // the same generic message regardless of whether the email exists.
    if (process.env.NODE_ENV !== 'production' && result.rawToken) {
      return NextResponse.json({
        message: 'Password reset link generated.',
        devResetUrl: `/reset-password?token=${result.rawToken}`,
      });
    }
    return NextResponse.json({
      message: 'If that email is registered, a reset link has been sent.',
    });
  } catch (err) {
    return jsonError(err);
  }
}
