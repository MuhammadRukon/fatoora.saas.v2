/**
 * Route-level checks for /api/app/zatca (plan AC6.3, AC6.6, AC6.7). The session and ZATCA's gateway (global fetch)
 * are mocked; services hit the real local DB.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { POST as onboard } from '@/app/api/app/zatca/onboard/route';
import { GET as getStatus } from '@/app/api/app/zatca/route';
import { prisma } from '@/lib/prisma';
import { businessData, testUsers } from '@/server/business/__tests__/fixtures';
import { clearRateLimit } from '@/server/common/rate-limit';
import { generateKeyPair } from '@/server/zatca';
import { selfSignedCertificate } from '@/server/zatca/__tests__/test-cert';

const users = testUsers('zroute');
let businessIds: string[] = [];
afterEach(async () => {
  m.auth.mockReset();
  vi.unstubAllGlobals();
  await Promise.all(businessIds.map((id) => clearRateLimit(`zatca-onboard:${id}`)));
  businessIds = [];
  await users.cleanup();
});

async function login({ business = true } = {}) {
  const user = await users.create();
  const day = 86_400_000;
  await prisma.subscription.create({
    data: {
      userId: user.id,
      plan: 'MONTH_1',
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - day),
      endsAt: new Date(Date.now() + 30 * day),
    },
  });
  if (business) {
    const b = await prisma.business.create({ data: { ...businessData(), ownerId: user.id } });
    businessIds.push(b.id);
  }
  m.auth.mockResolvedValue({ user: { id: user.id, email: user.email, name: user.name, role: 'USER' } });
}

const cert = selfSignedCertificate(generateKeyPair());
const token = Buffer.from(cert.pem.replace(/-----[^-]+-----|\s/g, '')).toString('base64');
const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
function stubZatca({ otpOk = true } = {}) {
  const realFetch = fetch; // the Redis limiter also uses fetch; only intercept ZATCA
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('gw-fatoora.zatca.gov.sa')) return realFetch(url, init);
      if (url.endsWith('/compliance')) {
        return otpOk
          ? respond(200, { requestID: 1, binarySecurityToken: token, secret: 'top-secret-value' })
          : respond(400, { code: 'Invalid-OTP', message: 'Invalid OTP' });
      }
      if (url.endsWith('/compliance/invoices')) return respond(200, { validationResults: { status: 'PASS' } });
      return respond(200, { requestID: 2, binarySecurityToken: token, secret: 'prod-secret-value' });
    }),
  );
}
const post = (otp: unknown) => onboard(new Request('http://t', { method: 'POST', body: JSON.stringify({ otp }) }));

describe('/api/app/zatca', () => {
  it('requires a business (409) and a session (401)', async () => {
    await login({ business: false });
    expect((await getStatus()).status).toBe(409);
    m.auth.mockResolvedValue(null);
    expect((await getStatus()).status).toBe(401);
    expect((await post('123456')).status).toBe(401);
  });

  it('rejects a malformed OTP with 422', async () => {
    await login();
    for (const otp of ['12345', '1234567', 'abcdef', 123456, undefined]) {
      expect((await post(otp)).status).toBe(422);
    }
  });

  it('AC6.3: GET after onboarding leaks no secrets, and the DB columns are encrypted', async () => {
    await login();
    stubZatca();
    const res = await post('123456');
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    for (const bad of ['top-secret-value', 'prod-secret-value', 'BEGIN']) expect(body).not.toContain(bad);

    const get = await getStatus();
    expect(get.status).toBe(200);
    const text = await get.text();
    expect(JSON.parse(text)).toMatchObject({ environment: 'SIMULATION', egs: { status: 'ACTIVE', lastError: null } });
    for (const bad of ['privateKey', 'secret', 'BEGIN', 'v1:']) expect(text).not.toContain(bad);

    const egs = await prisma.egsUnit.findFirstOrThrow({ where: { businessId: businessIds[0] } });
    expect(egs.privateKeyEnc!.startsWith('v1:')).toBe(true);
    expect(egs.productionSecretEnc!.startsWith('v1:')).toBe(true);
  });

  it('AC6.6: an invalid OTP is FAILED with ZATCA text, shown by GET', async () => {
    await login();
    stubZatca({ otpOk: false });
    const res = await post('000000');
    expect(await res.json()).toMatchObject({ status: 'FAILED', errors: ['Invalid-OTP: Invalid OTP'] });
    expect(await (await getStatus()).json()).toMatchObject({
      egs: { status: 'FAILED', lastError: 'Invalid-OTP: Invalid OTP' },
    });
  });

  it('AC6.7: the 6th onboarding attempt within the hour is 429 with Retry-After', async () => {
    await login();
    stubZatca({ otpOk: false });
    for (let i = 0; i < 5; i++) expect((await post('000000')).status).toBe(200);
    const sixth = await post('000000');
    expect(sixth.status).toBe(429);
    expect(Number(sixth.headers.get('Retry-After'))).toBeGreaterThan(0);
  });
});
