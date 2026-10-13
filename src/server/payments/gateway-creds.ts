import { PaymentMethod } from '@prisma/client';

/**
 * Pure credential-presence check for payment gateways. The providers'
 * `getCreds()` and `gatewayConfigured()` both go through this
 * so the list of required env vars lives in exactly one place.
 *
 * A gateway without credentials silently falls back to the self-payable
 * sandbox harness, so "configured" must be checked before a gateway is
 * offered to customers.
 */
type EnvLike = Readonly<Record<string, string | undefined>>;

/** Env vars each gateway needs; the single list `readEnv`, `hasGatewayCreds` and tests share. */
export const BKASH_ENV = [
  'BKASH_BASE_URL',
  'BKASH_APP_KEY',
  'BKASH_APP_SECRET',
  'BKASH_USERNAME',
  'BKASH_PASSWORD',
] as const;
export const SSLCOMMERZ_ENV = ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD'] as const;

const REQUIRED_ENV: Partial<Record<PaymentMethod, readonly string[]>> = {
  [PaymentMethod.BKASH]: BKASH_ENV,
  [PaymentMethod.SSLCOMMERZ]: SSLCOMMERZ_ENV,
};

/**
 * Reads every listed variable, or returns null if any is missing or empty.
 * A variable counts as present when its value is a non-empty string (so
 * whitespace-only values are present); values are returned untrimmed.
 * Providers treat null as "no credentials", which is the only thing that
 * lets a `sandbox_` ref be trusted.
 */
export function readEnv<K extends string>(
  keys: readonly K[],
  env: EnvLike,
): Record<K, string> | null {
  const out = {} as Record<K, string>;
  for (const key of keys) {
    const value = env[key];
    if (!value) return null;
    out[key] = value;
  }
  return out;
}

/** Methods with no entry above (COD, BANK_TRANSFER) need no credentials. */
export function hasGatewayCreds(method: PaymentMethod, env: EnvLike): boolean {
  const required = REQUIRED_ENV[method];
  if (!required) return true;
  return readEnv(required, env) !== null;
}

/** True when the method can be offered to customers, judged against the live process env. */
export function gatewayConfigured(method: PaymentMethod): boolean {
  return hasGatewayCreds(method, process.env);
}
