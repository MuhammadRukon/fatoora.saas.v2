import { afterEach, describe, expect, it } from 'vitest';

import { prisma } from '@/lib/prisma';
import { testUsers } from '@/server/business/__tests__/fixtures';
import { extractQrFromXml, PIH_SEED, verifySignedInvoice } from '@/server/zatca';

import { documentsService } from '../documents.service';
import { issuanceService } from '../issuance.service';
import { completeCustomer, createDraft, deps, mockGateway, NOW, setupIssuing } from './issuance-fixtures';

const users = testUsers('issue');
afterEach(() => users.cleanup());

const row = (id: string) => prisma.document.findUniqueOrThrow({ where: { id } });
const egsOf = (businessId: string) => prisma.egsUnit.findFirstOrThrow({ where: { businessId } });
const failure = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string; meta?: Record<string, unknown> }) => e);

describe('issuance.issueAndSubmit', () => {
  it('AC7.1/AC7.2: simplified invoice, chain, second invoice and a credit note', async () => {
    const { business } = await setupIssuing(users);
    const gw = mockGateway();
    const d1 = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d1.id, deps(gw.fetchImpl));

    const one = await row(d1.id);
    expect(one).toMatchObject({
      status: 'ISSUED',
      number: 'INV-000001',
      icv: 1,
      pih: PIH_SEED,
      submissionStatus: 'REPORTED',
      hasWarnings: false,
      isTest: true,
      submissionAttempts: 1,
      submittingSince: null,
    });
    expect(one.invoiceHash).toBeTruthy();
    expect(one.signedXml).toContain(`<cbc:UUID>${one.uuid}</cbc:UUID>`);
    expect(one.issuedAt).toEqual(NOW);
    expect(one.issueTime).toBe('09:30:00Z');
    expect(one.sellerSnapshot).toMatchObject({ name: 'Test Co' });
    expect(verifySignedInvoice(one.signedXml!)).toBeTruthy();
    expect(extractQrFromXml(one.signedXml!)).toBe(one.qrBase64);
    expect(await egsOf(business.id)).toMatchObject({ lastIcv: 1, lastInvoiceHash: one.invoiceHash });
    expect(gw.calls).toHaveLength(1);
    expect(gw.calls[0].path).toBe('/invoices/reporting/single');
    expect(gw.calls[0].body).toMatchObject({ invoiceHash: one.invoiceHash, uuid: one.uuid });
    expect(Buffer.from(gw.calls[0].body.invoice, 'base64').toString()).toBe(one.signedXml);

    const d2 = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d2.id, deps(gw.fetchImpl));
    const two = await row(d2.id);
    expect(two).toMatchObject({ icv: 2, pih: one.invoiceHash, number: 'INV-000002' });

    const cn = await createDraft(business.id, { kind: 'CREDIT_NOTE', billingReferenceId: d1.id, noteReason: 'Returned' });
    await issuanceService.issueAndSubmit(business.id, cn.id, deps(gw.fetchImpl));
    const note = await row(cn.id);
    expect(note).toMatchObject({ icv: 3, number: 'CN-000001', pih: two.invoiceHash });
    expect(note.signedXml).toContain('<cac:BillingReference>');
    expect(note.signedXml).toContain('INV-000001');
    expect(await row(d1.id)).toEqual(one); // the original is untouched
  });

  it('AC7.4: network error keeps the signed document PENDING_RETRY; retry reports it', async () => {
    const { business } = await setupIssuing(users);
    const bad = mockGateway({ report: { status: -1 } });
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(bad.fetchImpl));
    expect(await row(d.id)).toMatchObject({ status: 'ISSUED', submissionStatus: 'PENDING_RETRY', submissionAttempts: 1 });
    expect((await row(d.id)).signedXml).toContain('<Invoice');

    const ok = mockGateway();
    await issuanceService.retry(business.id, d.id, deps(ok.fetchImpl));
    expect(await row(d.id)).toMatchObject({ submissionStatus: 'REPORTED', submissionAttempts: 2 });
    const again = await failure(issuanceService.retry(business.id, d.id, deps(ok.fetchImpl)));
    expect(again?.code).toBe('CONFLICT');
  });

  it('server errors stay pending; auth errors also flag the EGS', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: 500, body: {} } }).fetchImpl));
    expect(await row(d.id)).toMatchObject({ submissionStatus: 'PENDING_RETRY', submissionAttempts: 1 });
    expect((await egsOf(business.id)).lastError).toBeNull();

    await issuanceService.retry(business.id, d.id, deps(mockGateway({ report: { status: 401, body: { message: 'bad' } } }).fetchImpl));
    expect(await row(d.id)).toMatchObject({ submissionStatus: 'PENDING_RETRY', submissionAttempts: 2 });
    expect((await egsOf(business.id)).lastError).toContain('re-onboard required');

    await issuanceService.retry(business.id, d.id, deps(mockGateway().fetchImpl));
    expect(await row(d.id)).toMatchObject({ submissionStatus: 'REPORTED' });
    expect((await egsOf(business.id)).lastError).toBeNull();
  });

  it('warnings (202) report with hasWarnings', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    const gw = mockGateway({ report: { status: 202, body: { validationResults: { status: 'WARNING', warningMessages: [{ code: 'W1', message: 'careful' }] } } } });
    await issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl));
    expect(await row(d.id)).toMatchObject({ submissionStatus: 'REPORTED', hasWarnings: true });
  });

  it('AC7.5: a rejection is final, the chain stays advanced, and a corrected copy continues it', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    const gw = mockGateway({ report: { status: 400, body: { validationResults: { status: 'ERROR', errorMessages: [{ code: 'E1', message: 'bad vat' }] } } } });
    await issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl));
    const rejected = await row(d.id);
    expect(rejected.submissionStatus).toBe('REJECTED');
    expect(JSON.stringify(rejected.zatcaResponse)).toContain('bad vat');
    expect((await egsOf(business.id)).lastIcv).toBe(1);
    expect((await failure(issuanceService.retry(business.id, d.id, deps(gw.fetchImpl))))?.code).toBe('CONFLICT');

    const copy = await documentsService.duplicateAsDraft(business.id, d.id);
    expect(copy.status).toBe('DRAFT');
    expect(copy.lines).toHaveLength(1);
    await issuanceService.issueAndSubmit(business.id, copy.id, deps(mockGateway().fetchImpl));
    expect(await row(copy.id)).toMatchObject({ icv: 2, pih: rejected.invoiceHash, submissionStatus: 'REPORTED' });
  });

  it('AC7.6: standard invoices are cleared (QR from the cleared XML); a 303 falls back to reporting', async () => {
    const { business } = await setupIssuing(users);
    const customer = await completeCustomer(business.id);
    const std = { subtype: 'STANDARD' as const, customerId: customer.id, supplyDate: '2026-10-01' };

    const d = await createDraft(business.id, std);
    const cleared = `<Invoice><cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">ZATCAQR==</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference></Invoice>`;
    const gw = mockGateway({
      clear: { status: 200, body: { validationResults: { status: 'PASS' }, clearanceStatus: 'CLEARED', clearedInvoice: Buffer.from(cleared).toString('base64') } },
    });
    await issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl));
    expect(gw.calls.map((c) => c.path)).toEqual(['/invoices/clearance/single']);
    const r = await row(d.id);
    expect(r).toMatchObject({ submissionStatus: 'CLEARED', clearedXml: cleared, qrBase64: 'ZATCAQR==' });
    expect(JSON.stringify(r.zatcaResponse)).not.toContain('clearedInvoice');

    const d2 = await createDraft(business.id, std);
    const gw2 = mockGateway({ clear: { status: 303, body: {} } });
    await issuanceService.issueAndSubmit(business.id, d2.id, deps(gw2.fetchImpl));
    expect(gw2.calls.map((c) => c.path)).toEqual(['/invoices/clearance/single', '/invoices/reporting/single']);
    expect(await row(d2.id)).toMatchObject({ submissionStatus: 'REPORTED', clearedXml: null, submissionAttempts: 1 });
  });

  it('AC7.7: an incomplete standard buyer is rejected; the draft and the chain stay untouched', async () => {
    const { business } = await setupIssuing(users);
    const customer = await completeCustomer(business.id, {
      vatNumber: null, street: null, buildingNumber: null, district: null, city: null, postalCode: null,
    });
    const d = await createDraft(business.id, { subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-10-01' });
    const err = await failure(issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway().fetchImpl)));
    expect(err?.code).toBe('VALIDATION_ERROR');
    expect(err?.meta?.fields).toEqual(['vatNumber', 'buildingNumber', 'postalCode', 'district', 'street', 'city']);
    expect((await row(d.id)).status).toBe('DRAFT');
    expect((await egsOf(business.id)).lastIcv).toBe(0);
  });

  it('rejects a note whose original is not issued, and a future supply date', async () => {
    const { business } = await setupIssuing(users);
    const customer = await completeCustomer(business.id);
    const d = await createDraft(business.id, { subtype: 'STANDARD', customerId: customer.id, supplyDate: '2026-11-01' });
    const err = await failure(issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway().fetchImpl)));
    expect(err?.meta?.code).toBe('SUPPLY_DATE_IN_FUTURE');
    expect((await egsOf(business.id)).lastIcv).toBe(0);
  });

  it('AC7.8: no ACTIVE EGS is a 409 ZATCA_NOT_ONBOARDED', async () => {
    const { business } = await setupIssuing(users, { egs: false });
    const d = await createDraft(business.id);
    const err = await failure(issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway().fetchImpl)));
    expect(err).toMatchObject({ code: 'CONFLICT', meta: { code: 'ZATCA_NOT_ONBOARDED' } });
  });

  it('an issued document cannot be issued again; another business gets a 404', async () => {
    const { business } = await setupIssuing(users);
    const other = await setupIssuing(users);
    const d = await createDraft(business.id);
    const gw = mockGateway();
    await issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl));
    expect((await failure(issuanceService.issueAndSubmit(business.id, d.id, deps(gw.fetchImpl))))?.meta?.code).toBe('DOCUMENT_IMMUTABLE');
    expect((await failure(issuanceService.issueAndSubmit(other.business.id, d.id, deps(gw.fetchImpl))))?.code).toBe('NOT_FOUND');
  });

  it('AC7.9: retryPending processes the oldest PENDING_RETRY documents first, at most 50', async () => {
    const { business } = await setupIssuing(users);
    const bad = mockGateway({ report: { status: -1 } });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = await createDraft(business.id);
      ids.push(d.id);
      await issuanceService.issueAndSubmit(business.id, d.id, deps(bad.fetchImpl, new Date(NOW.getTime() + i * 1000)));
    }
    const ok = mockGateway();
    const { processed } = await issuanceService.retryPending(deps(ok.fetchImpl));
    expect(processed).toBeGreaterThanOrEqual(3);
    const mine = (await Promise.all(ids.map((id) => row(id)))).map((r) => r.uuid);
    // Other test files may have pending documents too; only the relative order of ours matters.
    expect(ok.calls.map((c) => c.body.uuid).filter((u) => mine.includes(u))).toEqual(mine);
    expect(await prisma.document.count({ where: { businessId: business.id, submissionStatus: 'REPORTED' } })).toBe(3);
  });

  it('a held lease blocks a second submission', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: -1 } }).fetchImpl));
    await prisma.document.update({ where: { id: d.id }, data: { submittingSince: new Date() } });
    const gw = mockGateway();
    await issuanceService.retry(business.id, d.id, deps(gw.fetchImpl));
    expect(gw.calls).toHaveLength(0);
  });

  it('AC7.13: the overdue count includes simplified PENDING_RETRY documents older than 18h only', async () => {
    const { business } = await setupIssuing(users);
    const d = await createDraft(business.id);
    await issuanceService.issueAndSubmit(business.id, d.id, deps(mockGateway({ report: { status: -1 } }).fetchImpl));
    const issuedAt = NOW.getTime();
    expect(await documentsService.countUnreportedSimplified(business.id, new Date(issuedAt + 17 * 3600_000))).toBe(0);
    expect(await documentsService.countUnreportedSimplified(business.id, new Date(issuedAt + 19 * 3600_000))).toBe(1);
    await issuanceService.retry(business.id, d.id, deps(mockGateway().fetchImpl));
    expect(await documentsService.countUnreportedSimplified(business.id, new Date(issuedAt + 19 * 3600_000))).toBe(0);
  });
});
