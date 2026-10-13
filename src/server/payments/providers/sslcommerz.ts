import { PaymentMethod, PaymentStatus } from '@prisma/client';

import { log } from '@/server/common/logger';
import { takaToCents } from '@/server/common/money';

import { SSLCOMMERZ_ENV, readEnv } from '../gateway-creds';

import type {
  CallbackOutcome,
  PaymentGateway,
  PaymentInitInput,
  PaymentInitResult,
} from '../gateway.interface';

/**
 * SSLCommerz "Hosted Checkout" integration.
 *
 * Flow:
 *  1. We POST a session-init request with store credentials + amount.
 *  2. SSLCommerz returns a `GatewayPageURL` and a `sessionkey`.
 *  3. We redirect the customer to `GatewayPageURL`.
 *  4. After the customer pays, SSLCommerz POSTs to our IPN URL and
 *     also redirects the customer to our `success_url` / `fail_url`.
 *  5. We validate the IPN by calling the validator API to confirm
 *     `val_id` is genuine and matches the amount we expected.
 *
 * If store credentials are missing we fall back to the local sandbox
 * harness (`/api/payments/sandbox/...`) so the full flow remains
 * testable in development without a real merchant account.
 */

const SANDBOX_INIT_URL = 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';
const PROD_INIT_URL = 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';
const SANDBOX_VALIDATOR_URL =
  'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';
const PROD_VALIDATOR_URL = 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';

interface SslcCallbackPayload {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  store_amount?: string;
  card_type?: string;
}

interface InitResponse {
  status: string;
  GatewayPageURL?: string;
  sessionkey?: string;
  failedreason?: string;
}

interface ValidatorResponse {
  status: string;
  tran_id: string;
  amount: string;
  val_id: string;
  card_type?: string;
}

function getCreds() {
  const e = readEnv(SSLCOMMERZ_ENV, process.env);
  if (!e) return null;
  const sandbox = (process.env.SSLCOMMERZ_SANDBOX ?? 'true') === 'true';
  return { id: e.SSLCOMMERZ_STORE_ID, pwd: e.SSLCOMMERZ_STORE_PASSWORD, sandbox };
}

async function realInit(input: PaymentInitInput): Promise<PaymentInitResult> {
  const creds = getCreds();
  if (!creds) {
    // Sandbox fallback: send the user to our local harness, signed
    // with the paymentId so the harness IPN is unforgeable.
    return {
      redirectUrl: `/api/payments/sandbox/sslcommerz?paymentId=${encodeURIComponent(input.paymentId)}`,
      providerRef: `sandbox_${input.paymentId}`,
    };
  }

  const url = creds.sandbox ? SANDBOX_INIT_URL : PROD_INIT_URL;
  const body = new URLSearchParams({
    store_id: creds.id,
    store_passwd: creds.pwd,
    total_amount: (input.amountCents / 100).toFixed(2),
    currency: 'BDT',
    tran_id: input.paymentId,
    success_url: input.successUrl,
    fail_url: input.failUrl,
    cancel_url: input.cancelUrl,
    ipn_url: input.ipnUrl ?? '',
    cus_name: input.customer.name || 'Customer',
    cus_email: input.customer.email || 'noreply@example.com',
    cus_phone: input.customer.phone || '01700000000',
    cus_add1: 'N/A',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: input.orderNumber,
    product_category: 'general',
    product_profile: 'general',
  });

  const res = await fetch(url, { method: 'POST', body });
  const json = (await res.json()) as InitResponse;

  if (json.status !== 'SUCCESS' || !json.GatewayPageURL) {
    log.error('payments.sslcommerz.init_failed', {
      paymentId: input.paymentId,
      reason: json.failedreason,
    });
    throw new Error(json.failedreason || 'SSLCommerz session init failed');
  }
  return {
    redirectUrl: json.GatewayPageURL,
    providerRef: json.sessionkey,
    rawPayload: json,
  };
}

async function realParseCallback(payload: unknown): Promise<CallbackOutcome> {
  const data = payload as SslcCallbackPayload;
  const tran = data.tran_id;
  const valId = data.val_id;
  if (!tran) throw new Error('Missing tran_id in SSLCommerz callback');

  // Real credentials must be checked BEFORE trusting a `sandbox_`-prefixed
  // val_id — otherwise a forged callback with a fake sandbox ref could
  // bypass validation even when live credentials are configured.
  const creds = getCreds();

  if (!creds && typeof valId === 'string' && valId.startsWith('sandbox_')) {
    return {
      paymentId: tran,
      status:
        data.status === 'VALID' || data.status === 'VALIDATED'
          ? PaymentStatus.SUCCEEDED
          : data.status === 'CANCELLED'
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      providerRef: valId,
      rawPayload: data,
    };
  }

  if (!creds) {
    throw new Error('SSLCommerz credentials missing for live callback validation');
  }

  if (!valId) throw new Error('Missing val_id; cannot validate IPN');
  const url = `${creds.sandbox ? SANDBOX_VALIDATOR_URL : PROD_VALIDATOR_URL}?val_id=${encodeURIComponent(
    valId,
  )}&store_id=${encodeURIComponent(creds.id)}&store_passwd=${encodeURIComponent(creds.pwd)}&format=json`;
  const res = await fetch(url);
  const json = (await res.json()) as ValidatorResponse;

  const okStatuses = new Set(['VALID', 'VALIDATED']);
  return {
    paymentId: json.tran_id || tran,
    status: okStatuses.has(json.status) ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
    providerRef: json.val_id ?? valId,
    rawPayload: json,
    verifiedAmountCents: json.amount ? takaToCents(Number.parseFloat(json.amount)) : undefined,
  };
}

export const sslcommerzGateway: PaymentGateway = {
  method: PaymentMethod.SSLCOMMERZ,
  init: realInit,
  parseCallback: realParseCallback,
};
