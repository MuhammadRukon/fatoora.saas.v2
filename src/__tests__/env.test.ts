import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY_32 = Buffer.alloc(32, 7).toString('base64');

async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  vi.stubEnv('DATABASE_URL', 'postgresql://localhost/x');
  vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
  vi.stubEnv('NEXTAUTH_SECRET', 's');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  return import('../env');
}

afterEach(() => vi.unstubAllEnvs());

describe('env: ZATCA_ENCRYPTION_KEY', () => {
  it('accepts base64 of exactly 32 bytes', async () => {
    const { env } = await loadEnv({ ZATCA_ENCRYPTION_KEY: KEY_32, NODE_ENV: 'development' });
    expect(env.ZATCA_ENCRYPTION_KEY).toBe(KEY_32);
  });

  it('rejects a missing, short or non-base64 key', async () => {
    await expect(loadEnv({ ZATCA_ENCRYPTION_KEY: undefined })).rejects.toThrow();
    await expect(
      loadEnv({ ZATCA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).rejects.toThrow(/32 bytes/);
    await expect(loadEnv({ ZATCA_ENCRYPTION_KEY: 'not base64 at all!!' })).rejects.toThrow();
  });
});

describe('env: CRON_SECRET', () => {
  it('is optional outside production', async () => {
    const { env } = await loadEnv({
      ZATCA_ENCRYPTION_KEY: KEY_32,
      NODE_ENV: 'development',
      CRON_SECRET: undefined,
    });
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it('is required in production', async () => {
    await expect(
      loadEnv({ ZATCA_ENCRYPTION_KEY: KEY_32, NODE_ENV: 'production', CRON_SECRET: undefined }),
    ).rejects.toThrow(/CRON_SECRET/);
    const { env } = await loadEnv({
      ZATCA_ENCRYPTION_KEY: KEY_32,
      NODE_ENV: 'production',
      CRON_SECRET: 'c',
    });
    expect(env.CRON_SECRET).toBe('c');
  });
});
