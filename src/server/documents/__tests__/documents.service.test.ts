import { afterEach, describe, expect, it } from 'vitest';

import { documentDraftSchema, type DocumentDraftInput } from '@/contracts/documents';
import { customerInputSchema } from '@/contracts/customers';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/server/common/errors';
import { businessData, testUsers } from '@/server/business/__tests__/fixtures';
import { businessService } from '@/server/business/business.service';
import { customersService } from '@/server/customers/customers.service';

import { documentsService } from '../documents.service';
import { allocateNumber, formatDocumentNumber } from '../numbering';

const users = testUsers('docs');
afterEach(() => users.cleanup());

async function freshBusiness() {
  const user = await users.create();
  return (await businessService.upsertMine(user.id, businessData())).id;
}
const customer = (businessId: string) =>
  customersService.create(businessId, customerInputSchema.parse({ name: 'Acme', vatNumber: '310000000000003' }));

const line = { description: 'Widget', quantity: '3', unitPriceHalalas: 3333, taxCategory: 'S' as const };
const draft = (o: Partial<DocumentDraftInput> = {}) =>
  documentDraftSchema.parse({ kind: 'INVOICE', subtype: 'SIMPLIFIED', lines: [line], ...o });

/** Issuing is Phase 7; tests flip the row directly, as the plan's AC4.8 fixture does. */
const markIssued = (id: string, sequence = 1, kind: 'INVOICE' | 'CREDIT_NOTE' = 'INVOICE') =>
  prisma.document.update({
    where: { id },
    data: { status: 'ISSUED', kind, sequence, number: formatDocumentNumber(kind, sequence) },
  });

describe('documentsService drafts', () => {
  it('stores engine totals and line amounts, returns a DTO', async () => {
    const b = await freshBusiness();
    const doc = await documentsService.createDraft(b, draft());
    expect(doc).toMatchObject({
      status: 'DRAFT',
      number: null,
      taxExclusiveHalalas: 9999,
      taxHalalas: 1500,
      payableHalalas: 11499,
      seller: { name: 'Test Co', vatNumber: '300000000000003' },
    });
    expect(doc.lines[0]).toMatchObject({ position: 1, quantity: '3', netHalalas: 9999, vatHalalas: 1500 });
    expect(doc.taxSubtotals).toEqual([{ taxCategory: 'S', taxRateBp: 1500, taxableHalalas: 9999, taxHalalas: 1500 }]);
  });

  it('updates a draft (replacing lines) and deletes it', async () => {
    const b = await freshBusiness();
    const doc = await documentsService.createDraft(b, draft());
    const updated = await documentsService.updateDraft(b, doc.id, draft({ lines: [{ ...line, quantity: '1' }, line] }));
    expect(updated.lines).toHaveLength(2);
    expect(updated.payableHalalas).toBe(3833 + 11499);
    await documentsService.deleteDraft(b, doc.id);
    await expect(documentsService.get(b, doc.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC4.8: an ISSUED document cannot be changed or deleted', async () => {
    const b = await freshBusiness();
    const doc = await documentsService.createDraft(b, draft());
    await markIssued(doc.id);
    for (const op of [
      () => documentsService.updateDraft(b, doc.id, draft()),
      () => documentsService.deleteDraft(b, doc.id),
    ]) {
      const err = await op().catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.message).toContain('DOCUMENT_IMMUTABLE');
    }
  });

  it('treats documents, customers and originals of another business as not found', async () => {
    const a = await freshBusiness();
    const b = await freshBusiness();
    const doc = await documentsService.createDraft(a, draft());
    await expect(documentsService.get(b, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(documentsService.updateDraft(b, doc.id, draft())).rejects.toBeInstanceOf(NotFoundError);
    await expect(documentsService.deleteDraft(b, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(documentsService.duplicateAsDraft(b, doc.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await documentsService.list(b, {})).items).toEqual([]);

    const c = await customer(a);
    await expect(documentsService.createDraft(b, draft({ customerId: c.id }))).rejects.toBeInstanceOf(NotFoundError);
    await markIssued(doc.id);
    await expect(
      documentsService.createDraft(b, draft({ kind: 'CREDIT_NOTE', billingReferenceId: doc.id, noteReason: 'x' })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('AC4.5: a note needs an ISSUED invoice of the same subtype', async () => {
    const b = await freshBusiness();
    const original = await documentsService.createDraft(b, draft());
    const note = (id: string, o: Partial<DocumentDraftInput> = {}) =>
      draft({ kind: 'CREDIT_NOTE', billingReferenceId: id, noteReason: 'Returned', ...o });

    const notIssued = await documentsService.createDraft(b, note(original.id)).catch((e) => e);
    expect(notIssued).toBeInstanceOf(ConflictError);
    expect(notIssued.message).toContain('ORIGINAL_NOT_ISSUED');

    await markIssued(original.id);
    expect(await documentsService.createDraft(b, note(original.id))).toMatchObject({
      kind: 'CREDIT_NOTE',
      billingReference: { id: original.id, number: 'INV-000001' },
    });
    const c = await customer(b);
    await expect(
      documentsService.createDraft(b, note(original.id, { subtype: 'STANDARD', customerId: c.id, supplyDate: '2026-10-01' })),
    ).rejects.toBeInstanceOf(ValidationError);

    // a note cannot reference another note
    const cn = await documentsService.createDraft(b, note(original.id));
    await markIssued(cn.id, 1, 'CREDIT_NOTE');
    await expect(documentsService.createDraft(b, note(cn.id))).rejects.toBeInstanceOf(ValidationError);
  });

  it('duplicateAsDraft copies lines and customer into a new draft', async () => {
    const b = await freshBusiness();
    const c = await customer(b);
    const doc = await documentsService.createDraft(
      b,
      draft({ subtype: 'STANDARD', customerId: c.id, supplyDate: '2026-10-01' }),
    );
    await markIssued(doc.id);
    const copy = await documentsService.duplicateAsDraft(b, doc.id);
    expect(copy.id).not.toBe(doc.id);
    expect(copy).toMatchObject({ status: 'DRAFT', number: null, customerId: c.id, supplyDate: '2026-10-01', payableHalalas: 11499 });
    expect(copy.lines).toHaveLength(1);
  });

  it('lists newest first with filters, search and cursor', async () => {
    const b = await freshBusiness();
    const c = await customer(b);
    const d1 = await documentsService.createDraft(b, draft());
    await documentsService.createDraft(b, draft({ subtype: 'STANDARD', customerId: c.id, supplyDate: '2026-10-01' }));
    await markIssued(d1.id);

    expect((await documentsService.list(b, { status: 'ISSUED' })).items.map((i) => i.id)).toEqual([d1.id]);
    expect((await documentsService.list(b, { kind: 'CREDIT_NOTE' })).items).toEqual([]);
    expect((await documentsService.list(b, { q: 'acme' })).items).toHaveLength(1);
    expect((await documentsService.list(b, { q: 'INV-0000' })).items.map((i) => i.id)).toEqual([d1.id]);
    const first = await documentsService.list(b, { limit: 1 });
    expect(first.nextCursor).toBe(first.items[0].id);
    expect((await documentsService.list(b, { limit: 1, cursor: first.nextCursor! })).items).toHaveLength(1);
  });
});

describe('Document FK to Customer', () => {
  it('Phase 3 mapping: deleting a customer used by a document is CUSTOMER_HAS_DOCUMENTS', async () => {
    const b = await freshBusiness();
    const c = await customer(b);
    await documentsService.createDraft(b, draft({ customerId: c.id }));
    const err = await customersService.remove(b, c.id).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toContain('CUSTOMER_HAS_DOCUMENTS');
    expect(await customersService.get(b, c.id)).toMatchObject({ id: c.id });
  });
});

describe('allocateNumber', () => {
  it('formats and sorts numerically', () => {
    expect(formatDocumentNumber('INVOICE', 9)).toBe('INV-000009');
    expect(formatDocumentNumber('CREDIT_NOTE', 12)).toBe('CN-000012');
    expect(formatDocumentNumber('DEBIT_NOTE', 1)).toBe('DN-000001');
    expect(formatDocumentNumber('INVOICE', 9) < formatDocumentNumber('INVOICE', 10)).toBe(true);
  });

  it('AC4.9: 20 parallel allocations give 1..20, no duplicates or gaps; kinds are independent', async () => {
    const b = await freshBusiness();
    const issueOne = (kind: 'INVOICE' | 'CREDIT_NOTE') =>
      prisma.$transaction(async (tx) => {
        const { sequence, number } = await allocateNumber(tx, b, kind);
        await tx.document.create({
          data: { businessId: b, kind, subtype: 'SIMPLIFIED', status: 'ISSUED', sequence, number },
        });
        return sequence;
      });
    const seqs = await Promise.all(Array.from({ length: 20 }, () => issueOne('INVOICE')));
    expect([...seqs].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(await issueOne('CREDIT_NOTE')).toBe(1);
  }, 30_000);
});
