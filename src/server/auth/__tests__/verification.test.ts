/**
 * DB-backed like rate-limit.test.ts — runs against the real prisma
 * client configured via DATABASE_URL. Each test uses a randomised email
 * so runs don't collide, and cleans up its own VerificationToken rows.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';

import { hashResetToken } from '../tokens';
import { issueVerification, matchVerification } from '../verification';

const usedEmails: string[] = [];
function freshEmail() {
  const email = `verify-${Math.random()}@example.test`;
  usedEmails.push(email);
  return email;
}

afterEach(async () => {
  if (usedEmails.length > 0) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: usedEmails.splice(0) } },
    });
  }
});

describe('verification: issue + match', () => {
  it('matches a 6-digit code when the email matches', async () => {
    const email = freshEmail();
    const { code } = await issueVerification(email);
    expect(await matchVerification(code, email)).toBe(email);
  });

  it('rejects a code presented with the wrong email', async () => {
    const email = freshEmail();
    const { code } = await issueVerification(email);
    expect(await matchVerification(code, 'someone-else@example.test')).toBeNull();
  });

  it('matches a deeplink token and recovers the email without one supplied', async () => {
    const email = freshEmail();
    const { token } = await issueVerification(email);
    expect(await matchVerification(token, null)).toBe(email);
  });

  it('rejects an expired row', async () => {
    const email = freshEmail();
    const { code } = await issueVerification(email);
    // Force the rows into the past.
    await prisma.verificationToken.updateMany({
      where: { identifier: email },
      data: { expires: new Date(Date.now() - 1000) },
    });
    expect(await matchVerification(code, email)).toBeNull();
  });

  it('re-issuing invalidates the previous code', async () => {
    const email = freshEmail();
    const first = await issueVerification(email);
    await issueVerification(email);
    expect(await matchVerification(first.code, email)).toBeNull();
  });

  it('stores only hashes, never the raw secret', async () => {
    const email = freshEmail();
    const { code } = await issueVerification(email);
    const rawRow = await prisma.verificationToken.findFirst({
      where: { identifier: email, token: code },
    });
    expect(rawRow).toBeNull();
    const hashedRow = await prisma.verificationToken.findFirst({
      where: { identifier: email, token: hashResetToken(code) },
    });
    expect(hashedRow).not.toBeNull();
  });
});
