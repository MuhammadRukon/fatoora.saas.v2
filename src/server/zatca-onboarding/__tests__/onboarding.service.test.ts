import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { businessData, testUsers } from '@/server/business/__tests__/fixtures';
import { ConflictError } from '@/server/common/errors';
import { decrypt, generateKeyPair, PIH_SEED } from '@/server/zatca';
import { selfSignedCertificate } from '@/server/zatca/__tests__/test-cert';

import { onboardingService } from '../onboarding.service';

const KEY = Buffer.alloc(32, 7).toString('base64');
const users = testUsers('onb');
afterEach(() => users.cleanup());

const cert = selfSignedCertificate(generateKeyPair());
const token = (pem = cert.pem) => Buffer.from(pem.replace(/-----[^-]+-----|\s/g, '')).toString('base64');
const SECRET = 'compliance-secret-xyz';

async function setup(overrides: Parameters<typeof businessData>[0] = {}) {
  const user = await users.create();
  const business = await prisma.business.create({ data: { ...businessData(overrides), ownerId: user.id } });
  return business;
}

type Handler = (path: string, init: RequestInit) => { status: number; body: unknown };
function mockFetch(handler: Partial<Record<'compliance' | 'invoices' | 'csids', Handler>> = {}) {
  const calls: { path: string; init: RequestInit }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation', '');
    calls.push({ path, init: init! });
    const kind = path === '/compliance' ? 'compliance' : path === '/compliance/invoices' ? 'invoices' : 'csids';
    const defaults: Record<string, { status: number; body: unknown }> = {
      compliance: { status: 200, body: { requestID: 1234567890, binarySecurityToken: token(), secret: SECRET, dispositionMessage: 'ISSUED' } },
      invoices: { status: 200, body: { validationResults: { status: 'PASS', errorMessages: [], warningMessages: [], infoMessages: [] } } },
      csids: { status: 200, body: { requestID: 1234567891, binarySecurityToken: token(), secret: 'production-secret-abc' } },
    };
    const r = handler[kind]?.(path, init!) ?? defaults[kind];
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const deps = (f: typeof fetch) => ({ fetchImpl: f, encryptionKey: KEY, now: new Date('2026-10-14T09:30:00Z') });
const egsOf = (businessId: string) => prisma.egsUnit.findFirstOrThrow({ where: { businessId } });

describe('onboardingService.onboard', () => {
  it('runs the full flow to ACTIVE and stores secrets encrypted (AC6.3, AC6.5 mocked)', async () => {
    const business = await setup();
    const { impl, calls } = mockFetch();
    const res = await onboardingService.onboard(business.id, '123456', deps(impl));
    expect(res.status).toBe('ACTIVE');
    expect(res.results).toHaveLength(6);

    expect(calls.map((c) => c.path)).toEqual([
      '/compliance',
      ...Array(6).fill('/compliance/invoices'),
      '/production/csids',
    ]);
    expect(JSON.parse(calls.at(-1)!.init.body as string)).toEqual({ compliance_request_id: '1234567890' });

    const egs = await egsOf(business.id);
    expect(egs).toMatchObject({
      status: 'ACTIVE',
      lastIcv: 0,
      lastInvoiceHash: PIH_SEED,
      lastError: null,
      commonName: 'Test Co-EGS',
      complianceRequestId: '1234567890',
    });
    expect(egs.serialNumber).toMatch(/^1-Fatoora\|2-v2\|3-[0-9a-f-]{36}$/);
    expect(egs.certNotAfter).toEqual(new Date('2031-01-01T00:00:00Z'));
    for (const col of ['privateKeyEnc', 'complianceCsidEnc', 'complianceSecretEnc', 'productionCsidEnc', 'productionSecretEnc'] as const) {
      expect(egs[col]).toMatch(/^v1:/);
    }
    expect(decrypt(egs.privateKeyEnc!, KEY)).toContain('BEGIN PRIVATE KEY');
    expect(decrypt(egs.productionSecretEnc!, KEY)).toBe('production-secret-abc');
    expect(decrypt(egs.complianceSecretEnc!, KEY)).toBe(SECRET);
    expect(JSON.stringify(egs)).not.toContain(SECRET);
    expect(egs.certificatePem).toContain('BEGIN CERTIFICATE');

    // The compliance documents were authenticated with the compliance credentials.
    const auth = (calls[1].init.headers as Record<string, string>).Authorization;
    expect(Buffer.from(auth.replace('Basic ', ''), 'base64').toString()).toBe(`${token()}:${SECRET}`);
  });

  it('AC6.6: a bad OTP leaves the EGS FAILED with ZATCA text and stores no credentials', async () => {
    const business = await setup();
    const { impl } = mockFetch({
      compliance: () => ({ status: 400, body: { code: 'Invalid-OTP', message: 'Invalid OTP provided' } }),
    });
    const res = await onboardingService.onboard(business.id, '000000', deps(impl));
    expect(res).toMatchObject({ status: 'FAILED', errors: ['Invalid-OTP: Invalid OTP provided'] });
    const egs = await egsOf(business.id);
    expect(egs.status).toBe('FAILED');
    expect(egs.lastError).toContain('Invalid OTP provided');
    expect(egs).toMatchObject({ complianceCsidEnc: null, complianceSecretEnc: null, productionSecretEnc: null, certificatePem: null });
  });

  it('a rejected compliance document fails onboarding with the joined errors and no production CSID call', async () => {
    const business = await setup();
    let n = 0;
    const { impl, calls } = mockFetch({
      invoices: () =>
        ++n === 3
          ? { status: 400, body: { validationResults: { status: 'ERROR', errorMessages: [{ code: 'BR-KSA-1', message: 'bad thing' }] } } }
          : { status: 200, body: { validationResults: { status: 'PASS' } } },
    });
    const res = await onboardingService.onboard(business.id, '123456', deps(impl));
    expect(res.status).toBe('FAILED');
    expect(res.errors.join('\n')).toContain('BR-KSA-1: bad thing');
    expect(calls.some((c) => c.path === '/production/csids')).toBe(false);
    expect((await egsOf(business.id)).lastError).toContain('BR-KSA-1: bad thing');
  });

  it('a warning (202) passes but an error inside a 200/202 body does not', async () => {
    const business = await setup();
    const { impl } = mockFetch({
      invoices: () => ({ status: 202, body: { validationResults: { status: 'WARNING', warningMessages: [{ code: 'W', message: 'w' }] } } }),
    });
    expect((await onboardingService.onboard(business.id, '123456', deps(impl))).status).toBe('ACTIVE');

    const other = await setup();
    const bad = mockFetch({
      invoices: () => ({ status: 200, body: { validationResults: { errorMessages: [{ code: 'E', message: 'e' }] } } }),
    });
    expect((await onboardingService.onboard(other.id, '123456', deps(bad.impl))).status).toBe('FAILED');
  });

  it('resumes from COMPLIANCE_ISSUED without calling /compliance (no new OTP)', async () => {
    const business = await setup();
    let fail = true;
    const first = mockFetch({
      csids: () => (fail ? { status: 500, body: { message: 'boom' } } : { status: 200, body: { binarySecurityToken: token(), secret: 'p' } }),
    });
    const r1 = await onboardingService.onboard(business.id, '123456', deps(first.impl));
    expect(r1).toMatchObject({ status: 'COMPLIANCE_ISSUED', errors: ['boom'] });
    // A server error after the compliance stage keeps the credentials, so the next try needs no OTP.
    expect((await egsOf(business.id)).status).toBe('COMPLIANCE_ISSUED');

    fail = false;
    const second = mockFetch();
    const r2 = await onboardingService.onboard(business.id, '123456', deps(second.impl));
    expect(r2.status).toBe('ACTIVE');
    expect(second.calls[0].path).toBe('/compliance/invoices');
    expect(await prisma.egsUnit.count({ where: { businessId: business.id } })).toBe(1);
  });

  it('a retry after FAILED reuses the same EGS row with a fresh key', async () => {
    const business = await setup();
    const bad = mockFetch({ compliance: () => ({ status: 400, body: { message: 'Invalid OTP' } }) });
    await onboardingService.onboard(business.id, '000000', deps(bad.impl));
    const failed = await egsOf(business.id);
    await onboardingService.onboard(business.id, '123456', deps(mockFetch().impl));
    const active = await egsOf(business.id);
    expect(active).toMatchObject({ id: failed.id, serialNumber: failed.serialNumber, status: 'ACTIVE' });
  });

  it('refuses an already ACTIVE EGS without any network call', async () => {
    const business = await setup();
    await onboardingService.onboard(business.id, '123456', deps(mockFetch().impl));
    const { impl } = mockFetch();
    await expect(onboardingService.onboard(business.id, '123456', deps(impl))).rejects.toBeInstanceOf(ConflictError);
    expect(impl).not.toHaveBeenCalled();
  });

  it('stopAfterCompliance skips the production CSID and reports every document', async () => {
    const business = await setup();
    const { impl, calls } = mockFetch();
    const res = await onboardingService.onboard(business.id, '123456', { ...deps(impl), stopAfterCompliance: true });
    expect(res.status).toBe('COMPLIANCE_ISSUED');
    expect(res.results.map((r) => r.outcome)).toEqual(Array(6).fill('PASS'));
    expect(calls.some((c) => c.path === '/production/csids')).toBe(false);
  });

  it('records every raw response through the recorder', async () => {
    const business = await setup();
    const seen: string[] = [];
    await onboardingService.onboard(business.id, '123456', {
      ...deps(mockFetch().impl),
      recorder: (name) => seen.push(name),
    });
    expect(seen).toEqual(['01-compliance', ...[1, 2, 3, 4, 5, 6].map((i) => `02-compliance-invoice-${i}`), '03-production-csids']);
  });
});

describe('onboardingService.getStatus', () => {
  it('is null egs before onboarding, then exposes only safe fields (AC6.3)', async () => {
    const business = await setup();
    expect(await onboardingService.getStatus(business.id)).toEqual({ environment: 'SIMULATION', egs: null });
    await onboardingService.onboard(business.id, '123456', deps(mockFetch().impl));
    const status = await onboardingService.getStatus(business.id);
    expect(status.egs).toMatchObject({ status: 'ACTIVE', lastError: null });
    expect(Object.keys(status.egs!).sort()).toEqual(['certNotAfter', 'lastError', 'serialNumber', 'status']);
    const json = JSON.stringify(status);
    for (const bad of ['privateKey', 'secret', 'BEGIN', 'v1:']) expect(json).not.toContain(bad);
  });
});
