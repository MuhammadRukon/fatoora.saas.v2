import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { CryptoBoxError, decrypt, encrypt } from '../crypto-box';

const key = randomBytes(32).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${randomBytes(1500).toString('base64')}\n-----END PRIVATE KEY-----\n`;

describe('crypto-box (AC6.1)', () => {
  it('round-trips a 2 KB PEM with the v1 prefix', () => {
    expect(pem.length).toBeGreaterThan(2000);
    const box = encrypt(pem, key);
    expect(box.startsWith('v1:')).toBe(true);
    expect(decrypt(box, key)).toBe(pem);
  });

  it('uses a random IV: same plaintext encrypts differently', () => {
    expect(encrypt('x', key)).not.toBe(encrypt('x', key));
  });

  it('throws CryptoBoxError when a ciphertext byte is flipped', () => {
    const [v, iv, tag, ct] = encrypt(pem, key).split(':');
    const bytes = Buffer.from(ct, 'base64');
    bytes[0] ^= 1;
    expect(() => decrypt([v, iv, tag, bytes.toString('base64')].join(':'), key)).toThrow(CryptoBoxError);
  });

  it('throws CryptoBoxError on a wrong key, unknown version, malformed input or bad key length', () => {
    const box = encrypt('x', key);
    expect(() => decrypt(box, randomBytes(32).toString('base64'))).toThrow(CryptoBoxError);
    expect(() => decrypt(box.replace('v1:', 'v2:'), key)).toThrow(CryptoBoxError);
    expect(() => decrypt('garbage', key)).toThrow(CryptoBoxError);
    expect(() => encrypt('x', randomBytes(16).toString('base64'))).toThrow(CryptoBoxError);
  });
});
