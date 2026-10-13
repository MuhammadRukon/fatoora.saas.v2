import { PaymentMethod } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import {
  BKASH_ENV,
  SSLCOMMERZ_ENV,
  gatewayConfigured,
  hasGatewayCreds,
  readEnv,
} from '../gateway-creds';

const BKASH_VALUES = {
  BKASH_BASE_URL: 'https://example.invalid',
  BKASH_APP_KEY: 'key',
  BKASH_APP_SECRET: 'secret',
  BKASH_USERNAME: 'user',
  BKASH_PASSWORD: 'pass',
};

const SSLCOMMERZ_VALUES = {
  SSLCOMMERZ_STORE_ID: 'store',
  SSLCOMMERZ_STORE_PASSWORD: 'pwd',
};

describe('hasGatewayCreds', () => {
  it('is false for BKASH and SSLCOMMERZ with an empty env', () => {
    expect(hasGatewayCreds(PaymentMethod.BKASH, {})).toBe(false);
    expect(hasGatewayCreds(PaymentMethod.SSLCOMMERZ, {})).toBe(false);
  });

  it('is true for SSLCOMMERZ with store id and password', () => {
    expect(hasGatewayCreds(PaymentMethod.SSLCOMMERZ, SSLCOMMERZ_VALUES)).toBe(true);
  });

  it('is false for SSLCOMMERZ when either variable is missing or empty', () => {
    expect(
      hasGatewayCreds(PaymentMethod.SSLCOMMERZ, { SSLCOMMERZ_STORE_ID: 'store' }),
    ).toBe(false);
    expect(
      hasGatewayCreds(PaymentMethod.SSLCOMMERZ, { ...SSLCOMMERZ_VALUES, SSLCOMMERZ_STORE_PASSWORD: '' }),
    ).toBe(false);
  });

  it('is true for BKASH only when all five variables are set', () => {
    expect(hasGatewayCreds(PaymentMethod.BKASH, BKASH_VALUES)).toBe(true);
    for (const key of Object.keys(BKASH_VALUES)) {
      const partial: Record<string, string | undefined> = { ...BKASH_VALUES };
      delete partial[key];
      expect(hasGatewayCreds(PaymentMethod.BKASH, partial), `missing ${key}`).toBe(false);
    }
  });

  it('is always true for COD and BANK_TRANSFER', () => {
    expect(hasGatewayCreds(PaymentMethod.COD, {})).toBe(true);
    expect(hasGatewayCreds(PaymentMethod.BANK_TRANSFER, {})).toBe(true);
  });
});

describe('gatewayConfigured', () => {
  it('is true for COD and BANK_TRANSFER regardless of the process env', () => {
    expect(gatewayConfigured(PaymentMethod.COD)).toBe(true);
    expect(gatewayConfigured(PaymentMethod.BANK_TRANSFER)).toBe(true);
  });
});

/** The presence rule the providers used before readEnv: every key is a truthy string. */
const legacyPresent = (keys: readonly string[], env: Record<string, string | undefined>) =>
  keys.every((key) => Boolean(env[key]));

describe('readEnv', () => {
  const tuples = [
    { name: 'BKASH_ENV', keys: BKASH_ENV, values: BKASH_VALUES, method: PaymentMethod.BKASH },
    {
      name: 'SSLCOMMERZ_ENV',
      keys: SSLCOMMERZ_ENV,
      values: SSLCOMMERZ_VALUES,
      method: PaymentMethod.SSLCOMMERZ,
    },
  ];

  for (const { name, keys, values, method } of tuples) {
    it(`${name} lists exactly the variables the matching *_VALUES fixture defines`, () => {
      expect([...keys].sort()).toEqual(Object.keys(values).sort());
    });

    it(`${name}: returns every value verbatim when all are set`, () => {
      expect(readEnv(keys, values)).toEqual(values);
    });

    it(`${name}: missing, blank and whitespace-only values match the legacy presence rule`, () => {
      for (const key of keys) {
        for (const variant of [undefined, '', ' ', '	', ' v ']) {
          const env = { ...values, [key]: variant };
          const expected = legacyPresent(keys, env);
          const label = `${key}=${JSON.stringify(variant)}`;
          expect(readEnv(keys, env) !== null, label).toBe(expected);
          expect(hasGatewayCreds(method, env), label).toBe(expected);
          // Whitespace is present and passed through untrimmed; unset and "" are absent.
          expect(expected, label).toBe(Boolean(variant));
          if (expected) expect(readEnv(keys, env)?.[key as keyof typeof values]).toBe(variant);
        }
      }
    });

    it(`${name}: no variables set is null`, () => {
      expect(readEnv(keys, {})).toBeNull();
      expect(hasGatewayCreds(method, {})).toBe(false);
    });
  }

  it('ignores unlisted variables', () => {
    expect(readEnv(['A'], { A: '1', B: undefined })).toEqual({ A: '1' });
    expect(readEnv(['A', 'B'], { A: '1' })).toBeNull();
    expect(readEnv([], {})).toEqual({});
  });
});
