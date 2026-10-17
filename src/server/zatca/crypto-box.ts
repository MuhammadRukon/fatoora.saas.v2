import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM box for secrets at rest: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). The version prefix leaves room
// for key rotation. The key (base64, 32 bytes) is passed in by the caller; this module reads no env.
export class CryptoBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoBoxError';
  }
}

const keyBytes = (keyB64: string) => {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new CryptoBoxError('Encryption key must be 32 bytes');
  return key;
};

export function encrypt(plain: string, keyB64: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(keyB64), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decrypt(box: string, keyB64: string): string {
  const parts = box.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new CryptoBoxError('Unsupported or malformed encrypted value');
  const [, iv, tag, ct] = parts.map((p, i) => (i ? Buffer.from(p, 'base64') : p)) as [string, Buffer, Buffer, Buffer];
  try {
    const d = createDecipheriv('aes-256-gcm', keyBytes(keyB64), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch (e) {
    if (e instanceof CryptoBoxError) throw e;
    throw new CryptoBoxError('Decryption failed (wrong key or tampered value)');
  }
}
