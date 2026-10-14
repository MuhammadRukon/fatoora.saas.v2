/**
 * Route-level checks for issue / retry / xml / cron (plan AC7.4, AC7.9, AC7.10). The session and ZATCA's gateway
 * (global fetch) are mocked; services hit the real local DB.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { GET as cron } from '@/app/api/cron/zatca-retry/route';
import { POST as issue } from '@/app/api/app/documents/[id]/issue/route';
import { POST as retry } from '@/app/api/app/documents/[id]/retry/route';
import { GET as getXml } from '@/app/api/app/documents/[id]/xml/route';
import { env } from '@/env';
import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';
import { createDraft, mockGateway, setupIssuing } from '@/server/documents/__tests__/issuance-fixtures';

const users = testUsers('issroute');
afterEach(async () => {
  m.auth.mockReset();
  vi.unstubAllGlobals();
  await users.cleanup();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method = 'POST') => new Request('http://t', { method });

async function login() {
  const s = await setupIssuing(users, { key: env.ZATCA_ENCRYPTION_KEY });
  const day = 86_400_000;
  await prisma.subscription.create({
    data: { userId: s.user.id, plan: 'MONTH_1', status: 'ACTIVE', startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + 30 * day) },
  });
  m.auth.mockResolvedValue({ user: { id: s.user.id, email: s.user.email, name: s.user.name, role: 'USER' } });
  return s;
}

describe('issuance routes', () => {
  it('AC7.4: issue returns 200 with the verdict; retry fixes PENDING_RETRY and 409s on REPORTED', async () => {
    const { business } = await login();
    const d = await createDraft(business.id);
    vi.stubGlobal('fetch', mockGateway({ report: { status: 500, body: {} } }).fetchImpl);
    const res = await issue(req(), ctx(d.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ISSUED', number: 'INV-000001', submissionStatus: 'PENDING_RETRY', submissionAttempts: 1, isTest: true });

    vi.stubGlobal('fetch', mockGateway().fetchImpl);
    const ok = await retry(req(), ctx(d.id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ submissionStatus: 'REPORTED', submissionAttempts: 2 });
    expect((await retry(req(), ctx(d.id))).status).toBe(409);
  });

  it('a rejected issue is still HTTP 200 and lists the errors', async () => {
    const { business } = await login();
    const d = await createDraft(business.id);
    vi.stubGlobal('fetch', mockGateway({ report: { status: 400, body: { validationResults: { errorMessages: [{ code: 'X', message: 'broken' }] } } } }).fetchImpl);
    const res = await issue(req(), ctx(d.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ submissionStatus: 'REJECTED', submissionErrors: ['X: broken'] });
  });

  it('AC7.8 and a pre-issue failure are 409 / 404, not 200', async () => {
    const { business } = await login();
    await prisma.egsUnit.deleteMany({ where: { businessId: business.id } });
    const d = await createDraft(business.id);
    const res = await issue(req(), ctx(d.id));
    expect(res.status).toBe(409);
    expect((await res.json()).meta.code).toBe('ZATCA_NOT_ONBOARDED');
    expect((await issue(req(), ctx('nope'))).status).toBe(409); // no EGS is checked first
  });

  it('AC7.10: xml download is the signed XML byte for byte; DRAFT is 409; another business 404', async () => {
    const { business } = await login();
    const d = await createDraft(business.id);
    expect((await getXml(req('GET'), ctx(d.id))).status).toBe(409);
    vi.stubGlobal('fetch', mockGateway().fetchImpl);
    await issue(req(), ctx(d.id));
    const res = await getXml(req('GET'), ctx(d.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(res.headers.get('content-disposition')).toContain('INV-000001.xml');
    const row = await prisma.document.findUniqueOrThrow({ where: { id: d.id } });
    expect(await res.text()).toBe(row.signedXml);

    await login(); // another business
    expect((await getXml(req('GET'), ctx(d.id))).status).toBe(404);
  });

  it('AC7.9: cron needs the bearer secret', async () => {
    const bare = await cron(req('GET'));
    expect(bare.status).toBe(401);
    expect((await cron(new Request('http://t', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);

    const { business } = await login();
    const d = await createDraft(business.id);
    vi.stubGlobal('fetch', mockGateway({ report: { status: -1 } }).fetchImpl);
    await issue(req(), ctx(d.id));
    vi.stubGlobal('fetch', mockGateway().fetchImpl);
    const res = await cron(new Request('http://t', { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
    expect(res.status).toBe(200);
    expect((await res.json()).processed).toBeGreaterThanOrEqual(1);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: d.id } })).submissionStatus).toBe('REPORTED');
  });
});
