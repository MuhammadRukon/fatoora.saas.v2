'use server';

import { headers } from 'next/headers';
import { ZodError } from 'zod';

import { authService } from '@/server/auth/auth.service';
import { signOut as authSignOut } from '@/auth';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@/contracts/auth';
import { AppError, toJsonError } from '@/server/common/errors';
import { requireSession } from '@/server/common/http';
import { log } from '@/server/common/logger';
import { RateLimitedError, clearRateLimit, enforceRateLimit, ipFromHeaders } from '@/server/common/rate-limit';

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** dev-only convenience so the reset link is testable without email setup */
  devResetUrl?: string;
  /** dev-only: verification code/link shown when no mailer is configured */
  devCode?: string;
  devVerifyUrl?: string;
  fieldErrors?: Record<string, string>;
}

function fieldErrorsFromZod(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export async function signupAction(input: unknown): Promise<ActionResult> {
  try {
    await enforceRateLimit(`signup:${ipFromHeaders(await headers())}`, { max: 5, windowMs: 15 * 60 * 1000 });
    const data = signupSchema.parse(input);
    const user = await authService.signup(data);
    return {
      ok: true,
      message: 'Account created. Check your email for the verification code.',
      devCode: user.devCode ?? undefined,
      devVerifyUrl: user.devVerifyToken ? `/verify-email?token=${user.devVerifyToken}` : undefined,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: 'Invalid signup details', fieldErrors: fieldErrorsFromZod(err) };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many attempts. Try again in a few minutes.' };
    }
    if (err instanceof AppError) {
      return { ok: false, message: err.message };
    }
    log.error('auth.signup.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: toJsonError(err).message };
  }
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  try {
    await enforceRateLimit(`forgot:${ipFromHeaders(await headers())}`, { max: 5, windowMs: 60 * 60 * 1000 });
    const data = forgotPasswordSchema.parse(input);
    const result = await authService.issuePasswordReset(data);
    const devLink =
      process.env.NODE_ENV !== 'production' && result.rawToken
        ? `/reset-password?token=${result.rawToken}`
        : undefined;
    return {
      ok: true,
      message: 'If that email is registered, a reset link has been sent.',
      devResetUrl: devLink,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: 'Invalid email', fieldErrors: fieldErrorsFromZod(err) };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many requests. Try again in a few minutes.' };
    }
    log.error('auth.forgot.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: 'Could not process request' };
  }
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  try {
    await enforceRateLimit(`reset:${ipFromHeaders(await headers())}`, { max: 10, windowMs: 60 * 60 * 1000 });
    const data = resetPasswordSchema.parse(input);
    await authService.resetPassword(data);
    return { ok: true, message: 'Password updated. You can now sign in.' };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: 'Invalid reset payload', fieldErrors: fieldErrorsFromZod(err) };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many attempts. Try again in a few minutes.' };
    }
    if (err instanceof AppError) {
      return { ok: false, message: err.message };
    }
    log.error('auth.reset.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: toJsonError(err).message };
  }
}

export async function verifyEmailAction(input: unknown): Promise<ActionResult> {
  try {
    const data = verifyEmailSchema.parse(input);
    // 6-digit codes are brute-forceable; throttle attempts per email.
    // Deeplink tokens are 32 random bytes — no practical brute force.
    if (data.email) {
      await enforceRateLimit(`verify:${data.email}`, { max: 5, windowMs: 15 * 60 * 1000 });
    }
    await authService.verifyEmail({
      email: data.email,
      secret: data.token ?? data.code!,
    });
    return { ok: true, message: 'Email verified. You can now sign in.' };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        message: 'Invalid verification details',
        fieldErrors: fieldErrorsFromZod(err),
      };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many attempts. Try again in a few minutes.' };
    }
    if (err instanceof AppError) {
      return { ok: false, message: err.message };
    }
    log.error('auth.verify.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: toJsonError(err).message };
  }
}

export async function resendVerificationAction(input: unknown): Promise<ActionResult> {
  try {
    const data = resendVerificationSchema.parse(input);
    await enforceRateLimit(`resend-verify:${data.email}`, { max: 3, windowMs: 15 * 60 * 1000 });
    const result = await authService.resendVerification(data.email);
    // Always generic: no account enumeration via this action.
    return {
      ok: true,
      message: 'If that email needs verification, a new code has been sent.',
      devCode: result.devCode ?? undefined,
      devVerifyUrl: result.devVerifyToken
        ? `/verify-email?token=${result.devVerifyToken}`
        : undefined,
    };
  } catch (err) {
    if (err instanceof ZodError) {
      return { ok: false, message: 'Invalid email', fieldErrors: fieldErrorsFromZod(err) };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many resend requests. Try again in a few minutes.' };
    }
    log.error('auth.resendVerification.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: 'Could not process request' };
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireSession();
    // Parse BEFORE throttling so malformed payloads don't burn the
    // budget; only real change attempts count. Cleared on success so a
    // few wrong-current-password typos don't lock out a legitimate user.
    const data = changePasswordSchema.parse(input);
    const rlKey = `change-pw:${user.id}`;
    await enforceRateLimit(rlKey, { max: 10, windowMs: 15 * 60 * 1000 });
    await authService.changePassword(user.id, data);
    await clearRateLimit(rlKey);
    return { ok: true, message: 'Password updated.' };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        ok: false,
        message: 'Invalid password details',
        fieldErrors: fieldErrorsFromZod(err),
      };
    }
    if (err instanceof RateLimitedError) {
      return { ok: false, message: 'Too many attempts. Try again in a few minutes.' };
    }
    if (err instanceof AppError) {
      return { ok: false, message: err.message };
    }
    log.error('auth.changePassword.action.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: toJsonError(err).message };
  }
}

export async function logoutAction(): Promise<void> {
  await authSignOut();
}
