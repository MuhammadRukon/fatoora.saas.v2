import bcrypt from 'bcryptjs';

// bcrypt work factor. Cost is embedded in each hash, so raising this
// does not invalidate existing lower-cost hashes — they keep verifying
// and upgrade naturally the next time the user sets a password.
const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
