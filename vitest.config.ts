import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: false,
    globalSetup: ['./vitest.global-setup.ts'],
    // Live-DB tests (and their hooks) can be slow on a remote or cold database.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Never let tests send real email: the mailer skips when these are empty
    // (Prisma loads .env into process.env but does not override set vars).
    env: { RESEND_API_KEY: '', EMAIL_FROM: '' },
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
    exclude: ['**/node_modules/**'],
  },
});
