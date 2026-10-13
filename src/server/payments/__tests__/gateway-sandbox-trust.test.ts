/**
 * Security regression: a `sandbox_`-prefixed ref is trusted ONLY while the
 * gateway's credentials are absent (see the "Sandbox fallback" note in CLAUDE.md).
 *
 * The matrix pins the exact presence rule the providers have always used:
 * a variable counts as present when its value is a non-empty string, so
 * unset and "" are absent, while whitespace-only values are present and are
 * passed through untrimmed. These tests were written against the original
 * `hasGatewayCreds` + `?? ''` logic and must keep passing unchanged after any
 * refactor of how the providers read their environment.
 */
import { PaymentStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/common/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { bkashGateway } from '../providers/bkash';
import { sslcommerzGateway } from '../providers/sslcommerz';

const BKASH_KEYS = [
  'BKASH_BASE_URL',
  'BKASH_APP_KEY',
  'BKASH_APP_SECRET',
  'BKASH_USERNAME',
  'BKASH_PASSWORD',
] as const;
const SSLCOMMERZ_KEYS = ['SSLCOMMERZ_STORE_ID', 'SSLCOMMERZ_STORE_PASSWORD'] as const;

type Variant = string | undefined;
/** unset and "" are absent; everything else (including whitespace) is present. */
const VARIANTS: Variant[] = [undefined, '', ' ', '\t', ' v '];
const isPresent = (v: Variant) => Boolean(v);

function stubEnv(keys: readonly string[], values: Record<string, Variant>) {
  for (const key of keys) vi.stubEnv(key, values[key]);
}

function baseValues(keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    keys.map((k) => [k, k === 'BKASH_BASE_URL' ? 'https://bkash.invalid' : `val-${k}`]),
  );
}

/** Every env state in the matrix: all absent, all present, and each key set to each variant. */
function envStates(keys: readonly string[]) {
  const states: { label: string; values: Record<string, Variant>; configured: boolean }[] = [
    {
      label: 'all unset',
      values: Object.fromEntries(keys.map((k) => [k, undefined])),
      configured: false,
    },
    { label: 'all present', values: baseValues(keys), configured: true },
  ];
  for (const key of keys) {
    for (const variant of VARIANTS) {
      const values: Record<string, Variant> = { ...baseValues(keys), [key]: variant };
      states.push({
        label: `${key}=${JSON.stringify(variant)}`,
        values,
        configured: isPresent(variant),
      });
    }
  }
  return states;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('SSLCOMMERZ_SANDBOX', 'true');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const INIT_INPUT = {
  orderId: 'o1',
  paymentId: 'pay_1',
  orderNumber: 'ORD-1',
  amountCents: 150_000,
  customer: { name: 'A', email: 'a@example.com', phone: '01700000000' },
  successUrl: 'https://shop.invalid/s',
  failUrl: 'https://shop.invalid/f',
  cancelUrl: 'https://shop.invalid/c',
};

describe('SSLCommerz sandbox trust', () => {
  const callback = { tran_id: 'pay_1', val_id: 'sandbox_forged', status: 'VALID' };

  for (const state of envStates(SSLCOMMERZ_KEYS)) {
    it(`${state.label}: ${state.configured ? 'sandbox ref is NOT trusted' : 'sandbox ref is trusted'}`, async () => {
      stubEnv(SSLCOMMERZ_KEYS, state.values);
      fetchMock.mockResolvedValue({ json: async () => ({ status: 'INVALID_TRANSACTION' }) });

      const result = await sslcommerzGateway.parseCallback(callback);

      if (state.configured) {
        // Forged ref must go through the validator API and fail.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(PaymentStatus.FAILED);
        const url = String(fetchMock.mock.calls[0][0]);
        expect(url).toContain(
          `store_id=${encodeURIComponent(state.values.SSLCOMMERZ_STORE_ID ?? '')}`,
        );
        expect(url).toContain(
          `store_passwd=${encodeURIComponent(state.values.SSLCOMMERZ_STORE_PASSWORD ?? '')}`,
        );
      } else {
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          paymentId: 'pay_1',
          status: PaymentStatus.SUCCEEDED,
          providerRef: 'sandbox_forged',
        });
      }
    });

    it(`${state.label}: init ${state.configured ? 'uses the live gateway' : 'redirects to the sandbox harness'}`, async () => {
      stubEnv(SSLCOMMERZ_KEYS, state.values);
      fetchMock.mockResolvedValue({
        json: async () => ({ status: 'FAILED', failedreason: 'stubbed' }),
      });

      if (state.configured) {
        await expect(sslcommerzGateway.init(INIT_INPUT)).rejects.toThrow('stubbed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
        expect(body.get('store_id')).toBe(state.values.SSLCOMMERZ_STORE_ID ?? '');
        expect(body.get('store_passwd')).toBe(state.values.SSLCOMMERZ_STORE_PASSWORD ?? '');
      } else {
        const res = await sslcommerzGateway.init(INIT_INPUT);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(res).toEqual({
          redirectUrl: '/api/payments/sandbox/sslcommerz?paymentId=pay_1',
          providerRef: 'sandbox_pay_1',
        });
      }
    });
  }

  it('a missing val_id with absent credentials is rejected, not trusted', async () => {
    stubEnv(SSLCOMMERZ_KEYS, Object.fromEntries(SSLCOMMERZ_KEYS.map((k) => [k, undefined])));
    await expect(
      sslcommerzGateway.parseCallback({ tran_id: 'pay_1', status: 'VALID' }),
    ).rejects.toThrow('credentials missing');
  });

  it('SSLCOMMERZ_SANDBOX only picks the validator host, never the trust decision', async () => {
    stubEnv(SSLCOMMERZ_KEYS, baseValues(SSLCOMMERZ_KEYS));
    fetchMock.mockResolvedValue({ json: async () => ({ status: 'INVALID' }) });
    for (const flag of ['true', 'false', '', undefined]) {
      fetchMock.mockClear();
      vi.stubEnv('SSLCOMMERZ_SANDBOX', flag);
      const result = await sslcommerzGateway.parseCallback({
        tran_id: 'pay_1',
        val_id: 'sandbox_forged',
        status: 'VALID',
      });
      expect(result.status).toBe(PaymentStatus.FAILED);
      const url = String(fetchMock.mock.calls[0][0]);
      // Unset defaults to sandbox ("true"); only the exact string "true" is sandbox.
      expect(url.startsWith('https://sandbox.sslcommerz.com/')).toBe(
        flag === 'true' || flag === undefined,
      );
    }
  });
});

describe('bKash sandbox trust', () => {
  const callback = { paymentDbId: 'pay_1', paymentID: 'sandbox_forged', status: 'success' };

  for (const state of envStates(BKASH_KEYS)) {
    it(`${state.label}: ${state.configured ? 'sandbox ref is NOT trusted' : 'sandbox ref is trusted'}`, async () => {
      stubEnv(BKASH_KEYS, state.values);
      fetchMock.mockResolvedValue({ json: async () => ({ statusMessage: 'stubbed' }) });

      if (state.configured) {
        // Forged ref must go through live token grant + execute; the stub fails the grant.
        await expect(bkashGateway.parseCallback(callback)).rejects.toThrow('stubbed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(`${state.values.BKASH_BASE_URL}/tokenized/checkout/token/grant`);
        expect(init.headers).toMatchObject({
          username: state.values.BKASH_USERNAME,
          password: state.values.BKASH_PASSWORD,
        });
        expect(JSON.parse(init.body)).toEqual({
          app_key: state.values.BKASH_APP_KEY,
          app_secret: state.values.BKASH_APP_SECRET,
        });
      } else {
        const result = await bkashGateway.parseCallback(callback);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
          paymentId: 'pay_1',
          status: PaymentStatus.SUCCEEDED,
          providerRef: 'sandbox_forged',
        });
      }
    });

    it(`${state.label}: init ${state.configured ? 'uses the live gateway' : 'redirects to the sandbox harness'}`, async () => {
      stubEnv(BKASH_KEYS, state.values);
      fetchMock.mockResolvedValue({ json: async () => ({ statusMessage: 'stubbed' }) });

      if (state.configured) {
        await expect(bkashGateway.init(INIT_INPUT)).rejects.toThrow('stubbed');
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } else {
        const res = await bkashGateway.init(INIT_INPUT);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(res).toEqual({
          redirectUrl: '/api/payments/sandbox/bkash?paymentId=pay_1',
          providerRef: 'sandbox_pay_1',
        });
      }
    });
  }

  it('absent credentials with a non-sandbox ref throw rather than guess', async () => {
    stubEnv(BKASH_KEYS, Object.fromEntries(BKASH_KEYS.map((k) => [k, undefined])));
    await expect(
      bkashGateway.parseCallback({
        paymentDbId: 'pay_1',
        paymentID: 'real_123',
        status: 'success',
      }),
    ).rejects.toThrow('credentials missing');
  });
});
