import { assertLocalDatabase, describeTarget } from '../src/server/common/db-target';

const databaseUrl = process.env.DATABASE_URL;
const shadowUrl = process.env.SHADOW_DATABASE_URL;
const requireShadow = process.argv.includes('--require-shadow');

try {
  assertLocalDatabase({ databaseUrl, shadowUrl, requireShadow });
  console.log(`DB target OK: ${describeTarget(databaseUrl as string)}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : 'DB target check failed');
  process.exit(1);
}
