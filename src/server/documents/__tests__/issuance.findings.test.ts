import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';

import { issuanceService } from '../issuance.service';
import { completeCustomer, createDraft, deps, KEY, mockGateway, NOW, setupIssuing } from './issuance-fixtures';

const users = testUsers('issue-find');
afterEach(() => users.cleanup());

const row = (id: string) => prisma.document.findUniqueOrThrow({ where: { id } });
const egsOf = (businessId: string) => prisma.egsUnit.findFirstOrThrow({ where: { businessId } });

describe('submit with missing credentials (finding 20)', () => {
  it('records a visible EGS error and the attempt time instead of returning silently', async () => {
    const { business, egs } = await setupIssuing(users);
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: -1 } }).fetchImpl));
    await prisma.egsUnit.update({ where: { id: egs!.id }, data: { productionCsidEnc: null } });

    const gw = mockGateway();
    await issuanceService.retry(business.id, d.id, deps(gw.fetchImpl, new Date(NOW.getTime() + 60_000)));
    expect(gw.calls).toHaveLength(0);
    expect((await egsOf(business.id)).lastError).toContain('credentials');
    expect(await row(d.id)).toMatchObject({
      submissionStatus: 'PENDING_RETRY',
      lastAttemptAt: new Date(NOW.getTime() + 60_000),
      submittingSince: null,
    });
  });
});

describe('retryPending fairness (finding 3)', () => {
  it('a healthy document of another tenant is reached despite 50+ permanently failing older ones', async () => {
    const a = await setupIssuing(users, { egs: false });
    const b = await setupIssuing(users);
    const healthy = await createDraft(b.business.id);
    await issuanceService.issueAndSubmit(b.business.id, healthy.id, deps(mockGateway({ report: { status: -1 } }).fetchImpl));

    // No EGS on these: every submit fails the same way, forever.
    await prisma.document.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        businessId: a.business.id,
        kind: 'INVOICE' as const,
        subtype: 'SIMPLIFIED' as const,
        status: 'ISSUED' as const,
        submissionStatus: 'PENDING_RETRY' as const,
        issuedAt: new Date(Date.UTC(2000, 0, 1, 0, 0, i)),
      })),
    });

    const ok = mockGateway();
    let rounds = 0;
    while ((await row(healthy.id)).submissionStatus !== 'REPORTED' && rounds < 6) {
      rounds++;
      await issuanceService.retryPending(deps(ok.fetchImpl, new Date(NOW.getTime() + rounds * 1000)));
    }
    expect(await row(healthy.id)).toMatchObject({ submissionStatus: 'REPORTED' });
    expect(rounds).toBeLessThan(6);
  });
});

describe('duplicate responses (finding 4a)', () => {
  it('a simplified duplicate is REPORTED with a warning and a portal note', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: 409, body: {} } }).fetchImpl));
    const r = await row(d.id);
    expect(r).toMatchObject({ submissionStatus: 'REPORTED', hasWarnings: true, submissionAttempts: 1 });
    expect(JSON.stringify(r.zatcaResponse)).toContain('already received');
  });

  it('a standard duplicate stays PENDING_RETRY with a note (the cleared XML cannot be re-fetched)', async () => {
    const { business } = await setupIssuing(users);
    const customer = await completeCustomer(business.id);
    const d = await createDraft(business.id, { subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-10-01' });
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ clear: { status: 409, body: {} } }).fetchImpl));
    const r = await row(d.id);
    expect(r).toMatchObject({ submissionStatus: 'PENDING_RETRY', clearedXml: null });
    expect(JSON.stringify(r.zatcaResponse)).toContain('already cleared');
  });
});

describe('issue-time rules (findings 7, 10, 11)', () => {
  const failure = (p: Promise<unknown>) => p.then(() => null, (e: Error & { meta?: Record<string, unknown> }) => e);

  it('7: the supply date is compared with the Riyadh calendar date (21:30Z is already tomorrow there)', async () => {
    const { business } = await setupIssuing(users);
    const customer = await completeCustomer(business.id);
    const late = new Date('2026-10-14T21:30:00Z');
    const ok = await createDraft(business.id, { subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-10-15' });
    await issuanceService.issue(business.id, ok.id, deps(mockGateway().fetchImpl, late));
    expect((await row(ok.id)).status).toBe('ISSUED');

    const future = await createDraft(business.id, { subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-10-16' });
    const err = await failure(issuanceService.issue(business.id, future.id, deps(mockGateway().fetchImpl, late)));
    expect(err?.meta?.code).toBe('SUPPLY_DATE_IN_FUTURE');
  });

  it('10: an expired certificate is a 409 before anything is allocated', async () => {
    const { business, egs } = await setupIssuing(users);
    await prisma.egsUnit.update({ where: { id: egs!.id }, data: { certNotAfter: new Date(NOW.getTime() - 86_400_000) } });
    const d = await createDraft(business.id);
    const err = await failure(issuanceService.issue(business.id, d.id, deps(mockGateway().fetchImpl)));
    expect(err).toMatchObject({ code: 'CONFLICT', meta: { code: 'ZATCA_CERT_EXPIRED' } });
    expect(await row(d.id)).toMatchObject({ status: 'DRAFT', sequence: null, icv: null });
    expect((await egsOf(business.id)).lastIcv).toBe(0);
  });

  it('11: the issue time is taken after the EGS lock is acquired', async () => {
    const { business, egs } = await setupIssuing(users);
    const d = await createDraft(business.id);
    let release = new Date(0);
    let locked!: () => void;
    const held = new Promise<void>((r) => (locked = r));
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "EgsUnit" WHERE "id" = ${egs!.id} FOR UPDATE`;
      locked();
      await new Promise((r) => setTimeout(r, 500));
      release = new Date();
    });
    await held;
    await issuanceService.issue(business.id, d.id, { fetchImpl: mockGateway().fetchImpl, encryptionKey: KEY });
    await holder;
    expect((await row(d.id)).issuedAt!.getTime()).toBeGreaterThanOrEqual(release.getTime());
  });
});
