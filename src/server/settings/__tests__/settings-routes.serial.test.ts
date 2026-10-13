/**
 * Route-handler tests for GET/PUT /api/admin/settings/payments (live DB,
 * `@/auth` mocked so a session can be chosen per request). Mutates the
 * PaymentSettings singleton, so this file belongs to the serial vitest project.
 */
import { CodFeeType, PaymentMethod } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  cleanupCheckoutFixtures,
  createAdminUser,
  setPaymentSettings,
} from '@/server/checkout/__tests__/fixtures';
import { gatewayConfigured } from '@/server/payments/gateway-creds';

import { GET, PUT } from '@/app/api/admin/settings/payments/route';

const mockedAuth = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;

function signInAs(id: string, role: 'ADMIN' | 'CUSTOMER') {
  mockedAuth.mockResolvedValue({ user: { id, email: `${id}@example.com`, name: 'T', role } });
}

function put(body: unknown) {
  return new Request('http://localhost/api/admin/settings/payments', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID = {
  enabledMethods: [PaymentMethod.COD, PaymentMethod.BANK_TRANSFER],
  codFeeEnabled: true,
  codFeeType: CodFeeType.FLAT,
  codFeeValue: 10_000,
  qrImageUrl: null,
  qrImagePublicId: null,
  contactNumber: '01800000000',
  paymentNote: 'Send to this number',
};

beforeEach(() => {
  mockedAuth.mockResolvedValue(null);
});

afterEach(async () => {
  mockedAuth.mockReset();
  await cleanupCheckoutFixtures();
});

describe('GET /api/admin/settings/payments', () => {
  it('no session -> 401, customer -> 403', async () => {
    expect((await GET()).status).toBe(401);
    signInAs('customer-1', 'CUSTOMER');
    expect((await GET()).status).toBe(403);
  });

  it('admin -> 200 with every settings field and boolean gatewayConfigured, no env values', async () => {
    await setPaymentSettings({ contactNumber: '01800000000', paymentNote: 'hello' });
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(body.settings).sort()).toEqual(
      [
        'id',
        'enabledMethods',
        'codFeeEnabled',
        'codFeeType',
        'codFeeValue',
        'qrImageUrl',
        'qrImagePublicId',
        'contactNumber',
        'paymentNote',
        'updatedAt',
        'updatedById',
      ].sort(),
    );
    expect(body.settings.contactNumber).toBe('01800000000');
    expect(body.gatewayConfigured).toEqual({
      COD: true,
      BANK_TRANSFER: true,
      BKASH: gatewayConfigured(PaymentMethod.BKASH),
      SSLCOMMERZ: gatewayConfigured(PaymentMethod.SSLCOMMERZ),
    });
    for (const v of Object.values(body.gatewayConfigured)) expect(typeof v).toBe('boolean');
    for (const secret of [
      process.env.SSLCOMMERZ_STORE_PASSWORD,
      process.env.BKASH_PASSWORD,
      process.env.BKASH_APP_SECRET,
    ]) {
      if (secret) expect(JSON.stringify(body)).not.toContain(secret);
    }
  });
});

describe('PUT /api/admin/settings/payments', () => {
  it('no session -> 401, customer -> 403', async () => {
    expect((await PUT(put(VALID))).status).toBe(401);
    signInAs('customer-2', 'CUSTOMER');
    expect((await PUT(put(VALID))).status).toBe(403);
  });

  it('a valid body -> 200 and the row reads back with updatedById', async () => {
    await setPaymentSettings();
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await PUT(put(VALID));

    expect(res.status).toBe(200);
    const row = await prisma.paymentSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(row.enabledMethods).toEqual([PaymentMethod.COD, PaymentMethod.BANK_TRANSFER]);
    expect(row.codFeeEnabled).toBe(true);
    expect(row.codFeeValue).toBe(10_000);
    expect(row.contactNumber).toBe('01800000000');
    expect(row.paymentNote).toBe('Send to this number');
    expect(row.updatedById).toBe(admin.id);
    expect((await res.json()).settings.codFeeValue).toBe(10_000);
  });

  it('all four methods off -> 400 with a message', async () => {
    await setPaymentSettings();
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await PUT(put({ ...VALID, enabledMethods: [], codFeeEnabled: false }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.message).toMatch(/at least one payment method/i);
  });

  it('PERCENT value 0 -> 422 VALIDATION_ERROR', async () => {
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await PUT(put({ ...VALID, codFeeType: CodFeeType.PERCENT, codFeeValue: 0 }));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('codFeeEnabled=true without COD in enabledMethods -> 422', async () => {
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await PUT(put({ ...VALID, enabledMethods: [PaymentMethod.BANK_TRANSFER] }));

    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  it('a non-Cloudinary qrImageUrl -> 422', async () => {
    const admin = await createAdminUser();
    signInAs(admin.id, 'ADMIN');

    const res = await PUT(put({ ...VALID, qrImageUrl: 'https://evil.com/x.png' }));

    expect(res.status).toBe(422);
  });
});
