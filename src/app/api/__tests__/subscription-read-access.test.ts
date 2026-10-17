/**
 * Finding 14: an EXPIRED subscription keeps read-only access to issued records (GET xml, list, detail);
 * every write stays 402, and NONE/PENDING stay fully gated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { GET as list, POST as create } from '@/app/api/app/documents/route';
import { GET as detail, PATCH as patch } from '@/app/api/app/documents/[id]/route';
import { POST as duplicate } from '@/app/api/app/documents/[id]/duplicate/route';
import { POST as issue } from '@/app/api/app/documents/[id]/issue/route';
import { POST as retry } from '@/app/api/app/documents/[id]/retry/route';
import { GET as getXml } from '@/app/api/app/documents/[id]/xml/route';
import { env } from '@/env';
import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';
import { createDraft, mockGateway, setupIssuing } from '@/server/documents/__tests__/issuance-fixtures';
import { issuanceService } from '@/server/documents/issuance.service';

const users = testUsers('subread');
afterEach(async () => {
  m.auth.mockReset();
  await users.cleanup();
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown = {}) => new Request('http://t', { method: 'POST', body: JSON.stringify(body) });
const day = 86_400_000;

type State = 'ACTIVE' | 'EXPIRED' | 'PENDING' | 'NONE';
async function userIn(state: State) {
  const s = await setupIssuing(users, { key: env.ZATCA_ENCRYPTION_KEY });
  const d = await createDraft(s.business.id);
  await issuanceService.issueAndSubmit(s.business.id, d.id, { fetchImpl: mockGateway().fetchImpl, encryptionKey: env.ZATCA_ENCRYPTION_KEY });
  if (state === 'ACTIVE' || state === 'EXPIRED') {
    const [startsAt, endsAt] = state === 'ACTIVE' ? [new Date(Date.now() - day), new Date(Date.now() + 30 * day)] : [new Date(Date.now() - 60 * day), new Date(Date.now() - day)];
    await prisma.subscription.create({ data: { userId: s.user.id, plan: 'MONTH_1', status: 'ACTIVE', startsAt, endsAt } });
  }
  if (state === 'PENDING') await prisma.subscription.create({ data: { userId: s.user.id, plan: 'MONTH_1', status: 'PENDING' } });
  m.auth.mockResolvedValue({ user: { id: s.user.id, email: s.user.email, name: s.user.name, role: 'USER' } });
  return { ...s, docId: d.id };
}

describe('read access by subscription state (finding 14)', () => {
  it.each([
    ['ACTIVE', 200],
    ['EXPIRED', 200],
    ['PENDING', 402],
    ['NONE', 402],
  ] as const)('%s: GET xml, detail and list answer %i', async (state, status) => {
    const { docId } = await userIn(state);
    expect((await getXml(new Request('http://t'), ctx(docId))).status).toBe(status);
    expect((await detail(new Request('http://t'), ctx(docId))).status).toBe(status);
    expect((await list(new Request('http://t/api/app/documents'))).status).toBe(status);
  });

  it.each(['EXPIRED', 'PENDING', 'NONE'] as const)('%s: every write is 402', async (state) => {
    const { docId } = await userIn(state);
    expect((await create(post({ kind: 'INVOICE' }))).status).toBe(402);
    expect((await patch(post({}), ctx(docId))).status).toBe(402);
    expect((await issue(post(), ctx(docId))).status).toBe(402);
    expect((await retry(post(), ctx(docId))).status).toBe(402);
    expect((await duplicate(post(), ctx(docId))).status).toBe(402);
  });
});
