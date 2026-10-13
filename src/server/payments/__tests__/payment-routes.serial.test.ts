/**
 * Route-handler tests (live DB, `@/auth` mocked so a session can be chosen
 * per request). Covers auth/RBAC, response shapes, rate limiting and that
 * `jsonError` serializes `meta`. Reads the PaymentSettings singleton, so this
 * file belongs to the serial vitest project.
 */
import { CodFeeStatus, CodFeeType, OrderStatus, PaymentMethod } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  cleanupCheckoutFixtures,
  clearGatewayEnv,
  createAdminUser,
  createCheckoutFixture,
  createManualOrder,
  setPaymentSettings,
} from '@/server/checkout/__tests__/fixtures';

import { POST as adminFeePOST } from '@/app/api/admin/payments/[id]/fee/route';
import { POST as adminTxnIdPOST } from '@/app/api/admin/payments/[id]/txn-id/route';
import { GET as configGET, dynamic as configDynamic } from '@/app/api/checkout/config/route';
import { POST as checkoutPOST } from '@/app/api/checkout/route';
import { POST as quotePOST } from '@/app/api/checkout/quote/route';
import { POST as txnCheckPOST } from '@/app/api/payments/txn-check/route';
import { POST as txnIdPOST } from '@/app/api/payments/txn-id/route';

const mockedAuth = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;

const touchedUserIds: string[] = [];

function signInAs(id: string, role: 'ADMIN' | 'CUSTOMER' = 'CUSTOMER') {
  touchedUserIds.push(id);
  mockedAuth.mockResolvedValue({ user: { id, email: `${id}@example.com`, name: 'T', role } });
}

function signedOut() {
  mockedAuth.mockResolvedValue(null);
}

function post(url: string, body: unknown, ip = '203.0.113.7') {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

const FEE_ON = {
  codFeeEnabled: true,
  codFeeType: CodFeeType.FLAT,
  codFeeValue: 10_000,
  contactNumber: '01800000000',
};

beforeEach(() => {
  signedOut();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockedAuth.mockReset();
  const ids = touchedUserIds.splice(0);
  await prisma.rateLimitBucket.deleteMany({
    where: { OR: ids.map((id) => ({ key: { contains: id } })) },
  });
  await cleanupCheckoutFixtures();
});

describe('GET /api/checkout/config', () => {
  it('unauthenticated -> 401', async () => {
    const res = await configGET();
    expect(res.status).toBe(401);
  });

  it('is force-dynamic and sends Cache-Control: no-store', async () => {
    signInAs('config-user');
    await setPaymentSettings();
    expect(configDynamic).toBe('force-dynamic');

    const res = await configGET();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('always includes qr/contact/note (null when unset), even with the fee off', async () => {
    signInAs('config-user');
    await setPaymentSettings({ codFeeEnabled: false });

    const body = await (await configGET()).json();

    expect(body).toHaveProperty('qrImageUrl', null);
    expect(body).toHaveProperty('contactNumber', null);
    expect(body).toHaveProperty('paymentNote', null);
    expect(body.cod).toEqual({ feeEnabled: false, type: 'FLAT', value: 10_000 });
    expect(body.methods).toEqual(['COD']);
  });

  it('returns the stored qr/contact/note when the fee is off, and drops a gateway without credentials', async () => {
    clearGatewayEnv();
    signInAs('config-user');
    await setPaymentSettings({
      codFeeEnabled: false,
      enabledMethods: ['COD', 'BKASH', 'BANK_TRANSFER'],
      qrImageUrl: 'https://res.cloudinary.com/demo/image/upload/qr.png',
      contactNumber: '01800000000',
      paymentNote: 'Send to this number',
    });

    const body = await (await configGET()).json();

    expect(body.qrImageUrl).toBe('https://res.cloudinary.com/demo/image/upload/qr.png');
    expect(body.contactNumber).toBe('01800000000');
    expect(body.paymentNote).toBe('Send to this number');
    expect(body.methods).toContain('COD');
    expect(body.methods).toContain('BANK_TRANSFER');
    expect(body.methods).not.toContain('BKASH');
  });
});

describe('POST /api/payments/txn-check', () => {
  it('unauthenticated -> 401', async () => {
    const res = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'ABC12345' }));
    expect(res.status).toBe(401);
  });

  it('matches a stored id case-insensitively and trimmed; body keys are exactly [exists]', async () => {
    await createManualOrder({
      method: PaymentMethod.COD,
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
      customerTxnId: 'ABC12345',
    });
    signInAs('txn-check-user-1');

    const hit = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'abc12345 ' }));
    const miss = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'ZZZ99999' }));

    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ exists: true });
    expect(await miss.json()).toEqual({ exists: false });
    const keys = Object.keys(
      await (await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'abc12345' }))).json(),
    );
    expect(keys).toEqual(['exists']);
  });

  it('also matches a bank-transfer reference', async () => {
    await createManualOrder({ method: PaymentMethod.BANK_TRANSFER, bankRef: 'bankref77777' });
    signInAs('txn-check-user-2');

    const res = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'BANKREF77777' }));
    expect(await res.json()).toEqual({ exists: true });
  });

  it('the 11th call within the window is 429 with Retry-After', async () => {
    signInAs(`txn-check-rate-${Math.random().toString(36).slice(2, 8)}`);

    for (let i = 0; i < 10; i++) {
      const ok = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'NOPE123456' }));
      expect(ok.status).toBe(200);
    }
    const limited = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'NOPE123456' }));

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rotating IPs does not evade the per-user cap: the 31st call is 429', async () => {
    signInAs(`txn-check-user-cap-${Math.random().toString(36).slice(2, 8)}`);

    for (let i = 0; i < 30; i++) {
      const res = await txnCheckPOST(
        post('/api/payments/txn-check', { txnId: 'NOPE123456' }, `198.51.100.${i + 1}`),
      );
      expect(res.status).toBe(200);
    }
    const limited = await txnCheckPOST(
      post('/api/payments/txn-check', { txnId: 'NOPE123456' }, '198.51.100.200'),
    );

    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('a malformed id is a 422', async () => {
    signInAs('txn-check-user-3');
    const res = await txnCheckPOST(post('/api/payments/txn-check', { txnId: 'no' }));
    expect(res.status).toBe(422);
  });
});

describe('POST /api/payments/txn-id', () => {
  it('rotating IPs does not evade the per-user cap: the 31st call is 429', async () => {
    signInAs(`txn-id-user-cap-${Math.random().toString(36).slice(2, 8)}`);
    const body = { paymentId: 'no-such-payment', txnId: 'ABC12345' };

    for (let i = 0; i < 30; i++) {
      const res = await txnIdPOST(post('/api/payments/txn-id', body, `198.51.100.${i + 1}`));
      expect(res.status).not.toBe(429);
    }
    const limited = await txnIdPOST(post('/api/payments/txn-id', body, '198.51.100.200'));

    expect(limited.status).toBe(429);
  });

  it('unauthenticated -> 401', async () => {
    const res = await txnIdPOST(
      post('/api/payments/txn-id', { paymentId: 'x', txnId: 'ABC12345' }),
    );
    expect(res.status).toBe(401);
  });

  it('owner can add an id once; a duplicate is 409 TXN_ID_DUPLICATE with no order info', async () => {
    const taken = await createManualOrder({
      method: PaymentMethod.COD,
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
      customerTxnId: 'TAKEN12345',
    });
    const mine = await createManualOrder({
      method: PaymentMethod.COD,
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
    });
    signInAs(mine.userId);

    const dup = await txnIdPOST(
      post('/api/payments/txn-id', { paymentId: mine.payment.id, txnId: 'taken12345' }),
    );
    const dupBody = await dup.json();
    expect(dup.status).toBe(409);
    expect(dupBody.code).toBe('TXN_ID_DUPLICATE');
    expect(dupBody.meta).toBeUndefined();
    expect(JSON.stringify(dupBody)).not.toContain(taken.order.orderNumber);

    const ok = await txnIdPOST(
      post('/api/payments/txn-id', { paymentId: mine.payment.id, txnId: 'mine123456' }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).payment.customerTxnId).toBe('MINE123456');
  });
});

describe('POST /api/admin/payments/[id]/txn-id', () => {
  it('unauthenticated -> 401, customer -> 403', async () => {
    const { payment, userId } = await createManualOrder({
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
    });
    const req = () => post(`/api/admin/payments/${payment.id}/txn-id`, { txnId: 'ABC12345' });

    expect((await adminTxnIdPOST(req(), ctx(payment.id))).status).toBe(401);
    signInAs(userId, 'CUSTOMER');
    expect((await adminTxnIdPOST(req(), ctx(payment.id))).status).toBe(403);
  });

  it('a duplicate is 409 and the body carries meta.existingOrderId / existingOrderNumber', async () => {
    const admin = await createAdminUser();
    const taken = await createManualOrder({
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
      customerTxnId: 'TAKEN55555',
    });
    const mine = await createManualOrder({ feeStatus: CodFeeStatus.PENDING, feeCents: 10_000 });
    signInAs(admin.id, 'ADMIN');

    const res = await adminTxnIdPOST(
      post(`/api/admin/payments/${mine.payment.id}/txn-id`, { txnId: 'taken55555' }),
      ctx(mine.payment.id),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe('TXN_ID_DUPLICATE');
    expect(body.meta).toEqual({
      existingOrderId: taken.order.id,
      existingOrderNumber: taken.order.orderNumber,
    });
  });

  it('admin can set an id', async () => {
    const admin = await createAdminUser();
    const mine = await createManualOrder({ feeStatus: CodFeeStatus.PENDING, feeCents: 10_000 });
    signInAs(admin.id, 'ADMIN');

    const res = await adminTxnIdPOST(
      post(`/api/admin/payments/${mine.payment.id}/txn-id`, { txnId: 'adm9999999' }),
      ctx(mine.payment.id),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).payment.customerTxnId).toBe('ADM9999999');
  });
});

describe('POST /api/admin/payments/[id]/fee', () => {
  it('unauthenticated -> 401, customer -> 403, bad outcome -> 422', async () => {
    const { payment, userId } = await createManualOrder({
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
    });
    const url = `/api/admin/payments/${payment.id}/fee`;

    expect((await adminFeePOST(post(url, { outcome: 'VERIFIED' }), ctx(payment.id))).status).toBe(
      401,
    );
    signInAs(userId, 'CUSTOMER');
    expect((await adminFeePOST(post(url, { outcome: 'VERIFIED' }), ctx(payment.id))).status).toBe(
      403,
    );

    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');
    expect((await adminFeePOST(post(url, { outcome: 'SUCCEEDED' }), ctx(payment.id))).status).toBe(
      422,
    );
  });

  it('admin VERIFIED confirms the order; a repeat is 409', async () => {
    const admin = await createAdminUser();
    const { payment, order } = await createManualOrder({
      feeStatus: CodFeeStatus.PENDING,
      feeCents: 10_000,
    });
    signInAs(admin.id, 'ADMIN');
    const url = `/api/admin/payments/${payment.id}/fee`;

    const res = await adminFeePOST(post(url, { outcome: 'VERIFIED' }), ctx(payment.id));
    expect(res.status).toBe(200);
    expect((await res.json()).payment.feeStatus).toBe('VERIFIED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      OrderStatus.CONFIRMED,
    );

    const again = await adminFeePOST(post(url, { outcome: 'VERIFIED' }), ctx(payment.id));
    expect(again.status).toBe(409);
  });
});

describe('checkout routes', () => {
  it('POST /api/checkout returns feeRequired true with the fee on, false with it off', async () => {
    const on = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await setPaymentSettings(FEE_ON);
    signInAs(on.user.id);

    const withFee = await checkoutPOST(
      post('/api/checkout', { addressId: on.address.id, paymentMethod: 'COD' }),
    );
    const withFeeBody = await withFee.json();
    expect(withFee.status).toBe(201);
    expect(withFeeBody.feeRequired).toBe(true);
    expect(withFeeBody.redirectUrl).toBeNull();

    const off = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await setPaymentSettings({ codFeeEnabled: false });
    signInAs(off.user.id);

    const noFee = await checkoutPOST(
      post('/api/checkout', { addressId: off.address.id, paymentMethod: 'COD' }),
    );
    expect((await noFee.json()).feeRequired).toBe(false);
  });

  it('POST /api/checkout rejects a disabled method with 400 and the unavailable meta', async () => {
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await setPaymentSettings();
    signInAs(fx.user.id);

    const res = await checkoutPOST(
      post('/api/checkout', { addressId: fx.address.id, paymentMethod: 'BANK_TRANSFER' }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.meta).toEqual({ reason: 'payment_method_unavailable', method: 'BANK_TRANSFER' });
  });

  it('POST /api/checkout/quote returns the fee fields for COD', async () => {
    const fx = await createCheckoutFixture({ stock: 5, cartQty: 1 });
    await setPaymentSettings(FEE_ON);
    signInAs(fx.user.id);

    const res = await quotePOST(
      post('/api/checkout/quote', { addressId: fx.address.id, paymentMethod: 'COD' }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.codFeeCents).toBe(10_000);
    expect(body.dueOnDeliveryCents).toBe(body.totalCents - 10_000);
    expect(body.codFeeRule).toEqual({ type: 'FLAT', value: 10_000 });
  });
});
