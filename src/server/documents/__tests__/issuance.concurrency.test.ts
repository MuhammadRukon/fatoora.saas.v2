import { afterEach, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';
import { PIH_SEED } from '@/server/zatca';

import { issuanceService } from '../issuance.service';
import { createDraft, deps, mockGateway, setupIssuing } from './issuance-fixtures';

const users = testUsers('issuec');
afterEach(() => users.cleanup());

it('AC7.3: 10 parallel issues give ICVs 1..10, an unbroken PIH chain and no duplicate numbers', async () => {
  const { business } = await setupIssuing(users);
  const gw = mockGateway();
  const drafts = await Promise.all(Array.from({ length: 10 }, () => createDraft(business.id)));
  await Promise.all(drafts.map((d) => issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl))));

  const docs = await prisma.document.findMany({ where: { businessId: business.id }, orderBy: { icv: 'asc' } });
  expect(docs.map((d) => d.icv)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  docs.forEach((d, i) => expect(d.pih).toBe(i === 0 ? PIH_SEED : docs[i - 1].invoiceHash));
  expect(new Set(docs.map((d) => d.number)).size).toBe(10);
  expect(docs.map((d) => d.number)).toEqual(Array.from({ length: 10 }, (_, i) => `INV-${String(i + 1).padStart(6, '0')}`));
  expect(docs.every((d) => d.submissionStatus === 'REPORTED')).toBe(true);
  expect(await prisma.egsUnit.findFirstOrThrow({ where: { businessId: business.id } })).toMatchObject({
    lastIcv: 10,
    lastInvoiceHash: docs[9].invoiceHash,
  });
}, 60_000);
