import { createHash, randomBytes } from 'crypto';

/**
 * Password-reset token issuance. We hand the user the raw token
 * (one-time, in the email link) and store only its SHA-256 hash so
 * a database breach can't be used to log in.
 */
const RAW_TOKEN_BYTES = 32;
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface IssuedResetToken {
  raw: string;
  tokenHash: string;
  expiresAt: Date;
}

export function issueResetToken(): IssuedResetToken {
  const raw = randomBytes(RAW_TOKEN_BYTES).toString('hex');
  return {
    raw,
    tokenHash: hashResetToken(raw),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
