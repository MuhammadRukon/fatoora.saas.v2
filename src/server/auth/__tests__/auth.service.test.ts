/**
 * DB-backed like rate-limit.test.ts — real prisma via DATABASE_URL.
 * Every test uses a randomised email and cleans up the user it created
 * (cascade removes PasswordResetToken rows); VerificationToken rows are
 * keyed by email (no FK) so they're cleaned explicitly.
 *
 * The mailer is a no-op without RESEND_API_KEY, so no mocking is needed.
 */
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from '@/server/common/errors';

import { authService } from '../auth.service';
import { issueResetToken } from '../tokens';
import { issueVerification } from '../verification';
import { verifyPassword } from '../password';

const usedEmails: string[] = [];
function freshEmail() {
  const email = `svc-${Math.random()}@example.test`;
  usedEmails.push(email);
  return email;
}

afterEach(async () => {
  if (usedEmails.length === 0) return;
  const emails = usedEmails.splice(0);
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.verificationToken.deleteMany({ where: { identifier: { in: emails } } });
});

describe('authService.signup', () => {
  it('rejects a duplicate email with ConflictError', async () => {
    const email = freshEmail();
    await authService.signup({ name: 'Test', email, password: 'password123' });
    await expect(
      authService.signup({ name: 'Test', email, password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('authService.verifyEmail', () => {
  it('verifies with a valid code then rejects reuse (single-use)', async () => {
    // Issue verification directly rather than via signup: when a mailer
    // is configured (RESEND_API_KEY set), signup returns devCode: null,
    // and the real code is only stored hashed. issueVerification hands
    // back the raw code.
    const email = freshEmail();
    await prisma.user.create({ data: { name: 'Test', email, passwordHash: 'x' } });
    const { code } = await issueVerification(email);
    await authService.verifyEmail({ email, secret: code });

    const fresh = await prisma.user.findUnique({ where: { email } });
    expect(fresh?.emailVerified).not.toBeNull();

    // Rows consumed — a second attempt fails.
    await expect(authService.verifyEmail({ email, secret: code })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('authService.resetPassword', () => {
  async function makeUserWithReset(email: string) {
    const user = await prisma.user.create({
      data: { name: 'Test', email, passwordHash: await bcrypt.hash('oldpassword', 10) },
    });
    const issued = issueResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt },
    });
    return { user, raw: issued.raw };
  }

  it('rejects an expired token', async () => {
    const email = freshEmail();
    const user = await prisma.user.create({
      data: { name: 'Test', email, passwordHash: await bcrypt.hash('oldpassword', 10) },
    });
    const issued = issueResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(
      authService.resetPassword({ token: issued.raw, password: 'newpassword1' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an already-used token', async () => {
    const email = freshEmail();
    const { raw } = await makeUserWithReset(email);
    await authService.resetPassword({ token: raw, password: 'newpassword1' });
    await expect(
      authService.resetPassword({ token: raw, password: 'newpassword2' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sets the new password, marks used, verifies email, and kills sibling tokens', async () => {
    const email = freshEmail();
    const { user, raw } = await makeUserWithReset(email);
    // A second outstanding reset token for the same user.
    const sibling = issueResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sibling.tokenHash, expiresAt: sibling.expiresAt },
    });

    await authService.resetPassword({ token: raw, password: 'newpassword1' });

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('newpassword1', fresh!.passwordHash!)).toBe(true);
    expect(fresh?.emailVerified).not.toBeNull();

    // Sibling token deleted.
    const siblingRow = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sibling.tokenHash },
    });
    expect(siblingRow).toBeNull();
  });
});

describe('authService.changePassword', () => {
  it('rejects a wrong current password with UnauthorizedError', async () => {
    const email = freshEmail();
    const user = await prisma.user.create({
      data: { name: 'Test', email, passwordHash: await bcrypt.hash('correct-pass', 10) },
    });
    await expect(
      authService.changePassword(user.id, {
        currentPassword: 'wrong-pass',
        password: 'newpassword1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a Google-only account (no password hash) with BadRequestError', async () => {
    const email = freshEmail();
    const user = await prisma.user.create({
      data: { name: 'Test', email, passwordHash: null, emailVerified: new Date() },
    });
    await expect(
      authService.changePassword(user.id, {
        currentPassword: 'anything1',
        password: 'newpassword1',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('changes the password and invalidates outstanding reset tokens', async () => {
    const email = freshEmail();
    const user = await prisma.user.create({
      data: { name: 'Test', email, passwordHash: await bcrypt.hash('correct-pass', 10) },
    });
    const issued = issueResetToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: issued.tokenHash, expiresAt: issued.expiresAt },
    });

    await authService.changePassword(user.id, {
      currentPassword: 'correct-pass',
      password: 'brandnew-pass1',
    });

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword('brandnew-pass1', fresh!.passwordHash!)).toBe(true);
    const leftover = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: issued.tokenHash },
    });
    expect(leftover).toBeNull();
  });
});

describe('password back-compat', () => {
  it('verifies a legacy cost-10 hash after the cost bump to 12', async () => {
    const legacy = await bcrypt.hash('legacy-pass', 10);
    expect(legacy.includes('$10$')).toBe(true);
    expect(await verifyPassword('legacy-pass', legacy)).toBe(true);
  });
});
