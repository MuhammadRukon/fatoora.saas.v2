import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';

import { documentsService } from '../documents.service';
import { createDraft, setupIssuing } from './issuance-fixtures';

// Records the args of document.findMany (Prisma delegates cannot be spied directly).
const seen = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/lib/prisma', async (orig) => {
  const m = await orig<typeof import('@/lib/prisma')>();
  const doc = m.prisma.document;
  const wrapped = new Proxy(doc, {
    get: (t, k) =>
      k === 'findMany'
        ? (args: Record<string, unknown>) => {
            seen.push(args);
            return t.findMany(args as never);
          }
        : (t as never)[k],
  });
  return { prisma: new Proxy(m.prisma, { get: (t, k) => (k === 'document' ? wrapped : (t as never)[k]) }) };
});

const users = testUsers('doc-list-select');
afterEach(() => users.cleanup());

describe('documentsService.list (finding 8)', () => {
  it('selects only list columns, never the XML, QR or ZATCA response blobs', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    seen.length = 0;
    const page = await documentsService.list(business.id, { limit: 10 });
    expect(page.items.map((i) => i.id)).toEqual([d.id]);
    expect(page.items[0]).toMatchObject({ kind: 'INVOICE', status: 'DRAFT', customerName: null });
    const select = seen[0].select as Record<string, unknown>;
    expect(select).toBeDefined();
    expect(seen[0].include).toBeUndefined();
    for (const heavy of ['signedXml', 'clearedXml', 'qrBase64', 'zatcaResponse']) expect(select[heavy]).toBeUndefined();
    // And it is the real client underneath: the data above came from the DB.
    expect(await prisma.document.count({ where: { businessId: business.id } })).toBe(1);
  });
});
