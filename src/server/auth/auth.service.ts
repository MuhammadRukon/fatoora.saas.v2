import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  BadRequestError,
  UnauthorizedError,
} from '@/server/common/errors';
import { log } from '@/server/common/logger';
import {
  mailerConfigured,
  passwordChangedEmail,
  passwordResetEmail,
  sendMail,
  verificationEmail,
} from '@/server/common/mailer';

import { hashPassword, verifyPassword } from './password';
import { hashResetToken, issueResetToken } from './tokens';
import { issueVerification, matchVerification } from './verification';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignupInput,
} from '@/contracts/auth';

function verifyUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  return `${base}/verify-email?token=${token}`;
}

export const authService = {
  async signup(input: SignupInput) {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          phone: input.phone,
          passwordHash,
          role: UserRole.CUSTOMER,
        },
        select: { id: true, email: true, name: true, role: true },
      });

      const issued = await issueVerification(user.email);
      // Fire-and-forget: sendMail never rejects, and delivery failure
      // must not fail the signup (the user can hit "resend").
      void sendMail(user.email, verificationEmail(issued.code, verifyUrl(issued.token)));

      return {
        ...user,
        // Dev fallback (mirrors devResetUrl): expose the secrets only
        // when no mailer is configured so the flow is testable locally.
        devCode: mailerConfigured() ? null : issued.code,
        devVerifyToken: mailerConfigured() ? null : issued.token,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('An account with this email already exists', { field: 'email' });
      }
      throw err;
    }
  },

  /**
   * Verify via 6-digit code (email required) or deeplink token
   * (email recovered from the row). Consumes every outstanding
   * verification row for the email in the same transaction that
   * marks the user verified.
   */
  async verifyEmail(input: { email?: string; secret: string }) {
    const email = await matchVerification(input.secret, input.email ?? null);
    if (!email) {
      throw new ValidationError('Invalid or expired verification code');
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { email },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.deleteMany({ where: { identifier: email } }),
    ]);
    log.info('auth.emailVerified', { email });
    return { email };
  },

  /**
   * Re-issue a verification code. Response is always generic so this
   * can't be used to enumerate accounts; already-verified users and
   * unknown emails are silent no-ops.
   */
  async resendVerification(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { email: true, emailVerified: true },
    });
    if (!user || user.emailVerified) {
      log.info('auth.resendVerification.noop', { email });
      return { devCode: null as string | null, devVerifyToken: null as string | null };
    }
    const issued = await issueVerification(user.email);
    void sendMail(user.email, verificationEmail(issued.code, verifyUrl(issued.token)));
    return {
      devCode: mailerConfigured() ? null : issued.code,
      devVerifyToken: mailerConfigured() ? null : issued.token,
    };
  },

  /**
   * Issue a reset token. We always return success to the caller so that
   * the public response cannot be used to enumerate registered emails.
   * The raw token is returned only inside this server-side function;
   * the caller (a server action or API route) is responsible for
   * delivering it to the user (email, etc).
   */
  async issuePasswordReset(input: ForgotPasswordInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      log.info('auth.passwordReset.unknownEmail', { email: input.email });
      return { rawToken: null as string | null };
    }
    const issued = issueResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
      },
    });

    // Fire-and-forget: delivery failure is logged by the mailer and must
    // not change the (deliberately generic) response to the caller.
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/reset-password?token=${issued.raw}`;
    void sendMail(user.email, passwordResetEmail(resetUrl));

    return { rawToken: issued.raw };
  },

  async resetPassword(input: ResetPasswordInput) {
    if (!input.token) throw new BadRequestError('Token is required');
    const tokenHash = hashResetToken(input.token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) throw new NotFoundError('Reset token');
    if (record.usedAt) throw new ValidationError('This reset link has already been used');
    if (record.expiresAt.getTime() < Date.now()) {
      throw new ValidationError('This reset link has expired');
    }

    const passwordHash = await hashPassword(input.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        // Completing a reset proves mailbox ownership, so it also
        // verifies the email — unblocks users who lost the signup code.
        data: { passwordHash, emailVerified: record.user.emailVerified ?? new Date() },
      }),
      prisma.passwordResetToken.update({
        where: { tokenHash },
        data: { usedAt: new Date() },
      }),
      // Invalidate any OTHER outstanding reset tokens for this user, so a
      // second "forgot password" request can't leave a second live link.
      prisma.passwordResetToken.deleteMany({
        where: { userId: record.userId, usedAt: null, tokenHash: { not: tokenHash } },
      }),
    ]);

    void sendMail(record.user.email, passwordChangedEmail());
    log.info('auth.passwordReset.completed', { userId: record.userId });
  },

  /**
   * Change the password of an already-authenticated user. Requires the
   * current password (defence against session-hijack "silent" takeover
   * and against a shoulder-surfer who has an open session). Google-only
   * accounts (no local password) are rejected — they have nothing to
   * verify against. Success invalidates any outstanding reset tokens and
   * sends a security notification.
   */
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) throw new NotFoundError('User');
    if (!user.passwordHash) {
      throw new BadRequestError('This account uses Google sign-in and has no password to change');
    }

    const ok = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Current password is incorrect');

    const passwordHash = await hashPassword(input.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    ]);

    void sendMail(user.email, passwordChangedEmail());
    log.info('auth.passwordChanged', { userId: user.id });
  },
};
