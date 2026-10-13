import { PaymentMethod, PaymentStatus } from '@prisma/client';

import { log } from '@/server/common/logger';
import { takaToCents } from '@/server/common/money';

import { BKASH_ENV, readEnv } from '../gateway-creds';

import type {
  CallbackOutcome,
  PaymentGateway,
  PaymentInitInput,
  PaymentInitResult,
} from '../gateway.interface';

/**
 * bKash "Tokenized Checkout" integration.
 *
 * Two-step ceremony:
 *  1. Grant token (`/tokenized/checkout/token/grant`) using app key
 *     and password to obtain `id_token`.
 *  2. Create payment (`/tokenized/checkout/create`) with that token,
 *     amount and merchant invoice. Response carries `paymentID` and
 *     `bkashURL` to redirect the user to.
 *  3. After the user authorises the payment, bKash redirects back to
 *     `callbackURL?paymentID=...&status=success|failure|cancel`.
 *  4. We then call `/tokenized/checkout/execute` with the same token
 *     to finalise the transaction; the response confirms `trxID` and
 *     amount, which we cross-check before flipping the payment to
 *     SUCCEEDED.
 *
 * Without bKash credentials, both steps fall back to the local
 * `/api/payments/sandbox/bkash` harness so the rest of the system
 * behaves identically in dev environments.
 */

interface BkashTokenResponse {
  id_token?: string;
  refresh_token?: string;
  msg?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface BkashCreateResponse {
  paymentID?: string;
  bkashURL?: string;
  callbackURL?: string;
  successCallbackURL?: string;
  failureCallbackURL?: string;
  cancelledCallbackURL?: string;
  amount?: string;
  intent?: string;
  currency?: string;
  paymentCreateTime?: string;
  transactionStatus?: string;
  merchantInvoiceNumber?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface BkashExecuteResponse {
  paymentID: string;
  trxID?: string;
  transactionStatus?: string;
  amount?: string;
  currency?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface BkashCreds {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
}

function getCreds(): BkashCreds | null {
  const e = readEnv(BKASH_ENV, process.env);
  return (
    e && {
      baseUrl: e.BKASH_BASE_URL,
      appKey: e.BKASH_APP_KEY,
      appSecret: e.BKASH_APP_SECRET,
      username: e.BKASH_USERNAME,
      password: e.BKASH_PASSWORD,
    }
  );
}

async function grantToken(creds: BkashCreds): Promise<string> {
  const res = await fetch(`${creds.baseUrl}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      username: creds.username,
      password: creds.password,
    },
    body: JSON.stringify({
      app_key: creds.appKey,
      app_secret: creds.appSecret,
    }),
  });
  const json = (await res.json()) as BkashTokenResponse;
  if (!json.id_token) {
    log.error('payments.bkash.token_failed', { msg: json.msg, status: json.statusCode });
    throw new Error(json.statusMessage || 'bKash token grant failed');
  }
  return json.id_token;
}

async function realInit(input: PaymentInitInput): Promise<PaymentInitResult> {
  const creds = getCreds();
  if (!creds) {
    return {
      redirectUrl: `/api/payments/sandbox/bkash?paymentId=${encodeURIComponent(input.paymentId)}`,
      providerRef: `sandbox_${input.paymentId}`,
    };
  }

  const token = await grantToken(creds);

  const res = await fetch(`${creds.baseUrl}/tokenized/checkout/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token,
      'X-APP-Key': creds.appKey,
    },
    body: JSON.stringify({
      mode: '0011',
      payerReference: input.customer.phone || input.orderNumber,
      callbackURL: input.successUrl,
      amount: (input.amountCents / 100).toFixed(2),
      currency: 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: input.orderNumber,
    }),
  });

  const json = (await res.json()) as BkashCreateResponse;
  if (!json.paymentID || !json.bkashURL) {
    log.error('payments.bkash.create_failed', {
      paymentId: input.paymentId,
      msg: json.statusMessage,
    });
    throw new Error(json.statusMessage || 'bKash create payment failed');
  }
  return {
    redirectUrl: json.bkashURL,
    providerRef: json.paymentID,
    rawPayload: json,
  };
}

interface BkashCallbackPayload {
  paymentID?: string;
  status?: 'success' | 'failure' | 'cancel' | string;
  /** Provided by `payments.service` when constructing the outcome. */
  paymentDbId?: string;
}

async function realParseCallback(payload: unknown): Promise<CallbackOutcome> {
  const data = payload as BkashCallbackPayload;
  if (!data.paymentDbId) {
    throw new Error('Missing internal paymentId for bKash callback');
  }
  if (!data.paymentID) {
    throw new Error('Missing bKash paymentID');
  }

  // Real credentials must be checked BEFORE trusting a `sandbox_`-prefixed
  // paymentID — otherwise a forged callback with a fake sandbox ref could
  // bypass the execute call even when live credentials are configured.
  const creds = getCreds();

  if (!creds && data.paymentID.startsWith('sandbox_')) {
    return {
      paymentId: data.paymentDbId,
      status:
        data.status === 'success'
          ? PaymentStatus.SUCCEEDED
          : data.status === 'cancel'
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      providerRef: data.paymentID,
      rawPayload: data,
    };
  }

  if (!creds) {
    throw new Error('bKash credentials missing for live execute');
  }

  if (data.status !== 'success') {
    return {
      paymentId: data.paymentDbId,
      status: data.status === 'cancel' ? PaymentStatus.CANCELLED : PaymentStatus.FAILED,
      providerRef: data.paymentID,
      rawPayload: data,
    };
  }

  const token = await grantToken(creds);
  const exec = await fetch(`${creds.baseUrl}/tokenized/checkout/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token,
      'X-APP-Key': creds.appKey,
    },
    body: JSON.stringify({ paymentID: data.paymentID }),
  });
  const json = (await exec.json()) as BkashExecuteResponse;

  return {
    paymentId: data.paymentDbId,
    status: json.transactionStatus === 'Completed' ? PaymentStatus.SUCCEEDED : PaymentStatus.FAILED,
    providerRef: json.trxID ?? data.paymentID,
    rawPayload: json,
    verifiedAmountCents: json.amount ? takaToCents(Number.parseFloat(json.amount)) : undefined,
  };
}

export const bkashGateway: PaymentGateway = {
  method: PaymentMethod.BKASH,
  init: realInit,
  parseCallback: realParseCallback,
};
