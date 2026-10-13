import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * The PaymentSettings table is a shared singleton in the live test DB.
 * Files that mutate it, or whose assertions depend on its defaults
 * (placeOrder / quote / settings / the routes that read it), must never run
 * concurrently with each other, so they run in one project on a single
 * forked worker (files one at a time). Everything else stays parallel.
 *
 * Adding a test that calls placeOrder/quote or the settings service? Name it
 * `*.serial.test.ts`. The fixture helpers that mutate the singleton throw
 * when called from any other file name, so a forgotten rename fails loudly.
 */
const SERIAL_GLOB = 'src/**/*.serial.test.{ts,tsx}';

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
    projects: [
      {
        extends: true,
        test: {
          name: 'parallel',
          include: ['src/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.tsx'],
          exclude: ['**/node_modules/**', SERIAL_GLOB],
        },
      },
      {
        extends: true,
        test: {
          name: 'settings-serial',
          include: [SERIAL_GLOB],
          // One forked worker runs these files one at a time.
          poolOptions: { forks: { singleFork: true } },
        },
      },
    ],
  },
});
