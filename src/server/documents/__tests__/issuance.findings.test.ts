import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';

import { issuanceService } from '../issuance.service';
import { createDraft, deps, mockGateway, NOW, setupIssuing } from './issuance-fixtures';

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
