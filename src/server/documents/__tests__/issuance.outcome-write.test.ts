import { afterEach, describe, expect, it, vi } from 'vitest';

import { testUsers } from '@/server/business/__tests__/fixtures';
import { log } from '@/server/common/logger';

import { prisma } from '@/lib/prisma';

import { issuanceService } from '../issuance.service';
import { createDraft, deps, mockGateway, setupIssuing } from './issuance-fixtures';

// prisma.document.update rejects while `failures` has entries (the Prisma client's delegates cannot be spied directly).
const failures = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/prisma', async (orig) => {
  const m = await orig<typeof import('@/lib/prisma')>();
  const doc = m.prisma.document;
  const wrapped = new Proxy(doc, {
    get: (t, k) =>
      k === 'update'
        ? (...a: unknown[]) => (failures.length ? Promise.reject(new Error(failures.shift())) : (t.update as (...x: unknown[]) => unknown)(...a))
        : (t as never)[k],
  });
  return { prisma: new Proxy(m.prisma, { get: (t, k) => (k === 'document' ? wrapped : (t as never)[k]) }) };
});

const users = testUsers('issue-outcome');
afterEach(() => users.cleanup());

const row = (id: string) => prisma.document.findUniqueOrThrow({ where: { id } });

async function issueFailing() {
  const { business } = await setupIssuing(users);
  const d = await createDraft(business.id);
  await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: -1 } }).fetchImpl));
  return { id: d.id, businessId: business.id };
}

describe('lost outcome update (finding 4b)', () => {
  it('retries the outcome write once after a transient DB failure and logs it', async () => {
    const { id, businessId } = await issueFailing();
    const errLog = vi.spyOn(log, 'error').mockImplementation(() => {});
    failures.push('db blip');
    await issuanceService.retry(businessId, id, deps(mockGateway().fetchImpl));
    expect(await row(id)).toMatchObject({ submissionStatus: 'REPORTED', submittingSince: null });
    expect(errLog).toHaveBeenCalledWith('zatca.outcome_write_failed', expect.objectContaining({ documentId: id }));
    errLog.mockRestore();
  });

  it('logs the lost ZATCA response when the retry fails too, and the lease is still released', async () => {
    const { id, businessId } = await issueFailing();
    const errLog = vi.spyOn(log, 'error').mockImplementation(() => {});
    failures.push('down', 'still down'); // the lease release (a third update) then succeeds
    await expect(issuanceService.retry(businessId, id, deps(mockGateway().fetchImpl))).rejects.toThrow('still down');
    expect(errLog).toHaveBeenCalledWith('zatca.outcome_lost', expect.objectContaining({ documentId: id, httpStatus: 200, outcome: 'PASS' }));
    errLog.mockRestore();
    expect(await row(id)).toMatchObject({ submissionStatus: 'PENDING_RETRY', submittingSince: null });
  });
});
