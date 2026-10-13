import { randomBytes, randomInt } from 'crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

import { hashResetToken } from './tokens';

/**
 * Email-verification codes/links, backed by the (previously unused)
 * Auth.js-shaped `VerificationToken` table — no migration needed.
 *
 * Each issue stores TWO rows keyed by `identifier = email`:
 *   - sha256 of a 6-digit code (typed into the verify page)
 *   - sha256 of a 32-byte hex token (the email deeplink)
 * Either secret verifies the account; success deletes every row for
 * the email, so both are single-use and mutually invalidating.
 * Only hashes are stored — a DB leak can't verify accounts.
 */
export const VERIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface IssuedVerification {
  code: string;
  token: string;
  expiresAt: Date;
}

export async function issueVerification(
  email: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<IssuedVerification> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS);

  // Replace any previous outstanding code/link for this email.
  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.createMany({
    data: [
      { identifier: email, token: hashResetToken(code), expires: expiresAt },
      { identifier: email, token: hashResetToken(token), expires: expiresAt },
    ],
  });

  return { code, token, expiresAt };
}

/**
 * Check a code or deeplink token. For codes the caller must supply the
 * email (identifier must match); for deeplink tokens the email is
 * recovered from the row itself. Returns the verified email, or null.
 * Does NOT consume the rows — the caller deletes them in the same
 * transaction that sets `User.emailVerified`.
 */
export async function matchVerification(
  secret: string,
  email: string | null,
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string | null> {
  const row = await db.verificationToken.findUnique({
    where: { token: hashResetToken(secret) },
  });
  if (!row) return null;
  if (row.expires.getTime() < Date.now()) return null;
  if (email !== null && row.identifier !== email) return null;
  return row.identifier;
}
