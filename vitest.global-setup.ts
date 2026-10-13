import { assertLocalDatabase } from './src/server/common/db-target';

/**
 * Safety net: the suite hits a real Postgres (creating and deleting rows, mutating
 * the PaymentSettings singleton). Runs once before any test file; a throw aborts the
 * whole run. `npx vitest` skips npm pre hooks, so this is the test-time localhost
 * guard: it refuses any DATABASE_URL (or SHADOW_DATABASE_URL) that is not
 * localhost / 127.0.0.1 / [::1], and a missing DATABASE_URL. Use `npm test` so
 * dotenv-cli loads `.env.dev` first. There is deliberately no opt-out.
 */
export default function setup(): void {
  assertLocalDatabase({
    databaseUrl: process.env.DATABASE_URL,
    shadowUrl: process.env.SHADOW_DATABASE_URL,
  });
}
