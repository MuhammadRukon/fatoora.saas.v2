/**
 * Route-level checks for /api/app/documents (plan AC4.5-AC4.8). Only the session is mocked.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/auth', () => ({ auth: m.auth }));

import { GET as listDocuments, POST as createDocument } from '@/app/api/app/documents/route';
import {
  DELETE as deleteDocument,
  GET as getDocument,
  PATCH as patchDocument,
} from '@/app/api/app/documents/[id]/route';
import { POST as duplicateDocument } from '@/app/api/app/documents/[id]/duplicate/route';
import { PUT as putBusiness } from '@/app/api/app/business/route';
import { POST as createCustomer } from '@/app/api/app/customers/route';
import { prisma } from '@/lib/prisma';
import { testUsers, validBusiness } from '@/server/business/__tests__/fixtures';

const users = testUsers('docroute');
afterEach(async () => {
  m.auth.mockReset();
  await users.cleanup();
});

/** A subscribed USER with a business, signed in. */
async function login() {
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
  m.auth.mockResolvedValue({ user: { id: user.id, email: user.email, name: user.name, role: 'USER' } });
  await putBusiness(json('PUT', validBusiness()));
  return user;
}

const json = (method: string, body: unknown) => new Request('http://t', { method, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const issuePaths = async (res: Response) =>
  ((await res.json()).meta.issues as { path: (string | number)[] }[]).map((i) => i.path.join('.'));

const line = { description: 'Widget', quantity: '3', unitPriceHalalas: 3333, taxCategory: 'S' };
const body = (o: Record<string, unknown> = {}) => ({ kind: 'INVOICE', subtype: 'SIMPLIFIED', lines: [line], ...o });

describe('/api/app/documents', () => {
  it('AC4.5: notes need a reference and an issued original of this business', async () => {
    await login();
    const noRef = await createDocument(json('POST', body({ kind: 'CREDIT_NOTE', noteReason: 'x' })));
    expect(noRef.status).toBe(422); // plan says 400; repo convention is 422
    expect(await issuePaths(noRef)).toEqual(['billingReferenceId']);

    const draft = await (await createDocument(json('POST', body()))).json();
    const note = body({ kind: 'CREDIT_NOTE', billingReferenceId: draft.id, noteReason: 'Returned' });
    const res = await createDocument(json('POST', note));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('ORIGINAL_NOT_ISSUED');

    await login(); // another business
    const foreign = await createDocument(json('POST', note));
    expect(foreign.status).toBe(404);
  });

  it('AC4.6: STANDARD needs a customer (and supply date); SIMPLIFIED does not', async () => {
    await login();
    const std = await createDocument(json('POST', body({ subtype: 'STANDARD' })));
    expect(std.status).toBe(422);
    expect(await issuePaths(std)).toEqual(expect.arrayContaining(['customerId', 'supplyDate']));

    expect((await createDocument(json('POST', body()))).status).toBe(201);

    const customer = await (await createCustomer(json('POST', { name: 'Acme', vatNumber: '310000000000003' }))).json();
    const ok = await createDocument(json('POST', body({ subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-10-01' })));
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ buyer: { name: 'Acme' }, supplyDate: '2026-10-01' });
  });

  it('AC4.7: forged totals are stripped; stored amounts come from the engine', async () => {
    await login();
    const res = await createDocument(
      json('POST', body({ taxHalalas: 1, payableHalalas: 1, lineExtensionHalalas: 1, status: 'ISSUED', number: 'INV-000001' })),
    );
    expect(res.status).toBe(201);
    const doc = await res.json();
    expect(doc).toMatchObject({ taxHalalas: 1500, payableHalalas: 11499, status: 'DRAFT', number: null });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row).toMatchObject({ taxHalalas: 1500, payableHalalas: 11499, status: 'DRAFT' });
  });

  it('AC4.8: PATCH and DELETE on an issued document are 409 DOCUMENT_IMMUTABLE', async () => {
    await login();
    const doc = await (await createDocument(json('POST', body()))).json();
    await prisma.document.update({ where: { id: doc.id }, data: { status: 'ISSUED' } });
    for (const res of [
      await patchDocument(json('PATCH', body()), ctx(doc.id)),
      await deleteDocument(new Request('http://t', { method: 'DELETE' }), ctx(doc.id)),
    ]) {
      expect(res.status).toBe(409);
      expect((await res.json()).message).toContain('DOCUMENT_IMMUTABLE');
    }
    // an issued document can still be duplicated into a new draft
    const dup = await duplicateDocument(new Request('http://t', { method: 'POST' }), ctx(doc.id));
    expect(dup.status).toBe(201);
    expect(await dup.json()).toMatchObject({ status: 'DRAFT', payableHalalas: 11499 });
  });

  it('is scoped by business: other ids are 404 and lists are separate', async () => {
    await login();
    const doc = await (await createDocument(json('POST', body()))).json();
    await login();
    expect((await getDocument(new Request('http://t'), ctx(doc.id))).status).toBe(404);
    expect((await patchDocument(json('PATCH', body()), ctx(doc.id))).status).toBe(404);
    expect((await deleteDocument(new Request('http://t', { method: 'DELETE' }), ctx(doc.id))).status).toBe(404);
    expect((await duplicateDocument(new Request('http://t', { method: 'POST' }), ctx(doc.id))).status).toBe(404);
    expect((await (await listDocuments(new Request('http://t/api/app/documents'))).json()).items).toEqual([]);
  });

  it('rejects engine violations as 422 and edits a draft via PATCH', async () => {
    await login();
    const mixed = body({
      docDiscountHalalas: 100,
      docDiscountReason: 'promo',
      lines: [line, { description: 'Export', quantity: '1', unitPriceHalalas: 500, taxCategory: 'Z', exemptionReasonCode: 'VATEX-SA-32' }],
    });
    const bad = await createDocument(json('POST', mixed));
    expect(bad.status).toBe(422);
    expect((await bad.json()).message).toContain('DOC_DISCOUNT_MIXED_CATEGORIES');

    const doc = await (await createDocument(json('POST', body()))).json();
    const patched = await patchDocument(json('PATCH', body({ notes: 'Thanks', lines: [{ ...line, quantity: '1' }] })), ctx(doc.id));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ notes: 'Thanks', payableHalalas: 3833 });
    expect((await deleteDocument(new Request('http://t', { method: 'DELETE' }), ctx(doc.id))).status).toBe(204);
  });
});
