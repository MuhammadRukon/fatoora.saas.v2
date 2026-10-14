import { randomUUID } from 'node:crypto';
import { Prisma, type EgsUnit } from '@prisma/client';

import type { PartySnapshot } from '@/contracts/documents';
import { env } from '@/env';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/server/common/errors';
import { log } from '@/server/common/logger';
import {
  createZatcaClient,
  decrypt,
  extractQrFromXml,
  redactHeaders,
  signInvoice,
  riyadhDisplay,
  toZatcaDateTime,
  buildUnsignedInvoiceXml,
  type ZatcaAuth,
  type ZatcaResponse,
} from '@/server/zatca';

import { allocateNumber } from './numbering';
import { buyerParty, sellerParty } from './parties';
import { toZatcaInput } from './zatca-mapper';

export type IssuanceOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Base64 32-byte key; defaults to env.ZATCA_ENCRYPTION_KEY. */
  encryptionKey?: string;
  /** retryPending only: stop starting new submissions after this many ms (default 45 s, inside the 60 s route limit). */
  budgetMs?: number;
};

const MAX_BATCH = 50;
const CRON_BUDGET_MS = 45_000;
/** A claimed submission older than this is considered dead (the ZATCA client times out after 30 s). */
const LEASE_MS = 2 * 60_000;
const MISSING_CREDENTIALS = 'Missing ZATCA credentials for this unit; re-onboard required';
const AUTH_ERROR_PREFIX = 'ZATCA rejected the credentials';

const dayString = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const lockFailure = () =>
  new ConflictError('Issued documents cannot be changed (DOCUMENT_IMMUTABLE)', { code: 'DOCUMENT_IMMUTABLE' });

/** Missing fields a STANDARD invoice needs on its buyer (plan step 1.3), in form order. */
export function missingBuyerFields(buyer: PartySnapshot | null): string[] {
  if (!buyer) return ['name', 'vatNumber', 'buildingNumber', 'postalCode', 'district', 'street', 'city'];
  const a = buyer.address;
  const missing: string[] = [];
  if (!buyer.name?.trim()) missing.push('name');
  if (!buyer.vatNumber && !buyer.idValue) missing.push('vatNumber');
  if (a.countryCode === 'SA') {
    if (!a.buildingNumber) missing.push('buildingNumber');
    if (!a.postalCode) missing.push('postalCode');
    if (!a.district) missing.push('district');
  }
  if (!a.street) missing.push('street');
  if (!a.city) missing.push('city');
  if (!a.countryCode) missing.push('countryCode');
  return missing;
}

/**
 * Locks the EGS and the draft, validates, numbers, signs and persists the document in one transaction.
 * Returns the document id; nothing here touches the network (the signed XML is stored before any submission).
 */
async function issue(businessId: string, documentId: string, opts: IssuanceOptions = {}): Promise<string> {
  const key = opts.encryptionKey ?? env.ZATCA_ENCRYPTION_KEY;

  return prisma.$transaction(
    async (tx) => {
      const business = await tx.business.findUnique({ where: { id: businessId } });
      if (!business) throw new NotFoundError('Business');
      const environment = business.zatcaEnvironment;

      // 1. Lock the EGS row: this serialises every issue on the chain (ICV/PIH).
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "EgsUnit"
        WHERE "businessId" = ${businessId} AND "environment" = ${environment}::"ZatcaEnvironment" AND "status" = 'ACTIVE'
        FOR UPDATE`;
      const notOnboarded = () =>
        new ConflictError('Onboard your EGS unit with ZATCA first (ZATCA_NOT_ONBOARDED)', { code: 'ZATCA_NOT_ONBOARDED' });
      if (!locked.length) throw notOnboarded();
      const egs = await tx.egsUnit.findUniqueOrThrow({ where: { id: locked[0].id } });
      if (!egs.privateKeyEnc || !egs.certificatePem) throw notOnboarded();

      // Taken after the lock: queued issues must not stamp a time earlier than the chain predecessor's.
      const now = opts.now ?? new Date();
      if (egs.certNotAfter && egs.certNotAfter < now) {
        throw new ConflictError('The EGS certificate has expired; onboard again (ZATCA_CERT_EXPIRED)', { code: 'ZATCA_CERT_EXPIRED' });
      }

      // 2. Lock the document.
      const own = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Document" WHERE "id" = ${documentId} AND "businessId" = ${businessId} FOR UPDATE`;
      if (!own.length) throw new NotFoundError('Document');
      const doc = await tx.document.findUniqueOrThrow({
        where: { id: documentId },
        include: { lines: { orderBy: { position: 'asc' } }, customer: true },
      });
      if (doc.status !== 'DRAFT') throw lockFailure();

      // 3. Issue-time rules.
      const seller = sellerParty(business);
      const buyer = doc.customer ? buyerParty(doc.customer) : null;
      const { issueDate, issueTime } = toZatcaDateTime(now);
      if (doc.subtype === 'STANDARD') {
        const fields = missingBuyerFields(buyer);
        if (fields.length) {
          throw new ValidationError(`The customer is missing required fields: ${fields.join(', ')} (BUYER_INCOMPLETE)`, {
            code: 'BUYER_INCOMPLETE',
            fields,
          });
        }
      }
      let billingReferenceNumber: string | null = null;
      if (doc.kind !== 'INVOICE') {
        const original = doc.billingReferenceId
          ? await tx.document.findFirst({ where: { id: doc.billingReferenceId, businessId }, select: { number: true, status: true, kind: true, subtype: true } })
          : null;
        if (!original || original.status !== 'ISSUED') {
          throw new ConflictError('The original invoice is not issued (ORIGINAL_NOT_ISSUED)', { code: 'ORIGINAL_NOT_ISSUED' });
        }
        if (original.kind !== 'INVOICE' || original.subtype !== doc.subtype) {
          throw new ValidationError('The original must be an invoice of the same type (ORIGINAL_SUBTYPE_MISMATCH)', { code: 'ORIGINAL_SUBTYPE_MISMATCH' });
        }
        billingReferenceNumber = original.number;
      }
      if (doc.supplyDate && dayString(doc.supplyDate)! > riyadhDisplay(now).slice(0, 10)) {
        throw new ValidationError('The supply date cannot be after the issue date (SUPPLY_DATE_IN_FUTURE)', { code: 'SUPPLY_DATE_IN_FUTURE' });
      }

      // 4-5. Number, identity and chain position.
      const { sequence, number } = await allocateNumber(tx, businessId, doc.kind);
      const uuid = randomUUID();
      const icv = egs.lastIcv + 1;
      const pih = egs.lastInvoiceHash;

      // 6. Build and sign with the key held in memory only.
      const input = toZatcaInput({
        kind: doc.kind,
        subtype: doc.subtype,
        number,
        uuid,
        icv,
        pih,
        issueDate,
        issueTime,
        seller,
        buyer,
        supplyDate: dayString(doc.supplyDate),
        supplyEndDate: dayString(doc.supplyEndDate),
        paymentMeansCode: doc.paymentMeansCode,
        billingReferenceNumber,
        noteReason: doc.noteReason,
        docDiscountHalalas: doc.docDiscountHalalas,
        docDiscountReason: doc.docDiscountReason,
        lines: doc.lines.map((l) => ({
          description: l.description,
          unitCode: l.unitCode,
          quantity: l.quantity.toString(),
          unitPriceHalalas: l.unitPriceHalalas,
          lineDiscountHalalas: l.lineDiscountHalalas,
          taxCategory: l.taxCategory,
          taxRateBp: l.taxRateBp,
          exemptionReasonCode: l.exemptionReasonCode,
          exemptionReason: l.exemptionReason,
        })),
      });
      if (input.totals.payableHalalas !== doc.payableHalalas) {
        throw new Error('Stored totals no longer match the VAT engine; refusing to sign');
      }
      const { signedXml, invoiceHash, qr } = signInvoice({
        xml: buildUnsignedInvoiceXml(input),
        privateKeyPem: decrypt(egs.privateKeyEnc, key),
        certificatePem: egs.certificatePem,
        signingTime: now,
      });

      // 7-8. Persist the document and advance the chain.
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: 'ISSUED',
          sequence,
          number,
          uuid,
          icv,
          pih,
          invoiceHash,
          signedXml,
          qrBase64: qr,
          signingTime: now,
          issueDate: new Date(`${issueDate}T00:00:00.000Z`),
          issueTime,
          issuedAt: now,
          sellerSnapshot: seller as unknown as Prisma.InputJsonValue,
          buyerSnapshot: buyer as unknown as Prisma.InputJsonValue,
          egsUnitId: egs.id,
          submissionStatus: 'PENDING_RETRY',
          isTest: environment === 'SIMULATION',
        },
      });
      await tx.egsUnit.update({ where: { id: egs.id }, data: { lastIcv: icv, lastInvoiceHash: invoiceHash } });
      return documentId;
    },
    { maxWait: 30_000, timeout: 60_000 },
  );
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * Sends one ISSUED, PENDING_RETRY document to ZATCA (outside any transaction) and records the outcome.
 * A lease column keeps cron and manual retry from submitting the same document twice.
 */
async function submit(documentId: string, opts: IssuanceOptions = {}): Promise<void> {
  const key = opts.encryptionKey ?? env.ZATCA_ENCRYPTION_KEY;
  const now = opts.now ?? new Date();
  const claimed = await prisma.document.updateMany({
    where: {
      id: documentId,
      status: 'ISSUED',
      submissionStatus: 'PENDING_RETRY',
      OR: [{ submittingSince: null }, { submittingSince: { lt: new Date(Date.now() - LEASE_MS) } }],
    },
    data: { submittingSince: new Date() },
  });
  if (!claimed.count) return; // already submitted, or another worker has it

  try {
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { egsUnit: true } });
    const egs: EgsUnit | null = doc.egsUnit;
    if (!egs?.productionCsidEnc || !egs.productionSecretEnc || !doc.signedXml || !doc.uuid || !doc.invoiceHash) {
      log.error('zatca.submit_missing_credentials', { documentId });
      // Visible on the ZATCA page, and the attempt time moves the document to the back of the retry queue.
      if (egs) await prisma.egsUnit.update({ where: { id: egs.id }, data: { lastError: MISSING_CREDENTIALS } });
      await prisma.document.update({ where: { id: documentId }, data: { lastAttemptAt: now } });
      return;
    }
    const auth: ZatcaAuth = {
      binarySecurityToken: decrypt(egs.productionCsidEnc, key),
      secret: decrypt(egs.productionSecretEnc, key),
    };
    const client = createZatcaClient(egs.environment, opts.fetchImpl ?? fetch, {
      logger: (e) => log.info('zatca.request', { ...e, headers: redactHeaders(e.headers) }),
    });
    const payload = { invoiceHash: doc.invoiceHash, uuid: doc.uuid, invoice: Buffer.from(doc.signedXml, 'utf8').toString('base64') };

    let res: ZatcaResponse;
    let cleared = false;
    if (doc.subtype === 'STANDARD') {
      res = await client.clear(auth, payload);
      cleared = true;
      if (res.outcome === 'CLEARANCE_DISABLED') {
        res = await client.report(auth, payload);
        cleared = false;
      }
    } else {
      res = await client.report(auth, payload);
    }

    const body = asRecord(res.body);
    const { clearedInvoice, ...storedBody } = body;
    const data: Prisma.DocumentUpdateInput = {
      submissionAttempts: { increment: 1 },
      lastAttemptAt: now,
      zatcaResponse: { httpStatus: res.httpStatus, outcome: res.outcome, ...storedBody } as Prisma.InputJsonValue,
    };
    if (res.outcome === 'PASS' || res.outcome === 'WARNING') {
      data.submissionStatus = cleared ? 'CLEARED' : 'REPORTED';
      data.hasWarnings = res.outcome === 'WARNING';
      if (cleared && typeof clearedInvoice === 'string') {
        const clearedXml = Buffer.from(clearedInvoice, 'base64').toString('utf8');
        data.clearedXml = clearedXml;
        const qr = extractQrFromXml(clearedXml);
        if (qr) data.qrBase64 = qr;
      }
    } else if (res.outcome === 'DUPLICATE') {
      // ASSUMPTION (see client.ts): ZATCA already has this document. A reported one is done; a cleared one lost its
      // response, and the cleared XML cannot be re-fetched, so it stays pending with a note. Confirm at the Simulation gate.
      data.zatcaResponse = {
        httpStatus: res.httpStatus,
        outcome: res.outcome,
        ...storedBody,
        submissionNote: cleared
          ? 'ZATCA reports this document already cleared; clearance XML unavailable, check the Fatoora portal'
          : 'ZATCA reports this document already received; confirm in the Fatoora portal',
      } as Prisma.InputJsonValue;
      if (!cleared) {
        data.submissionStatus = 'REPORTED';
        data.hasWarnings = true;
      }
    } else if (res.outcome === 'REJECTED') {
      data.submissionStatus = 'REJECTED';
    } else if (res.outcome === 'AUTH_ERROR') {
      await prisma.egsUnit.update({
        where: { id: egs.id },
        data: { lastError: `${AUTH_ERROR_PREFIX} (HTTP ${res.httpStatus}); re-onboard required` },
      });
    }
    try {
      await prisma.document.update({ where: { id: documentId }, data });
    } catch (err) {
      // ZATCA has answered but the outcome was not saved: retry once; a resubmission would later answer DUPLICATE.
      log.error('zatca.outcome_write_failed', { documentId, error: err instanceof Error ? err.message : String(err) });
      try {
        await prisma.document.update({ where: { id: documentId }, data });
      } catch (err2) {
        log.error('zatca.outcome_lost', { documentId, httpStatus: res.httpStatus, outcome: res.outcome, error: err2 instanceof Error ? err2.message : String(err2) });
        throw err2;
      }
    }
    if (res.outcome === 'PASS' || res.outcome === 'WARNING' || res.outcome === 'REJECTED') {
      // The credentials worked, so a stale auth failure no longer applies.
      await prisma.egsUnit.updateMany({ where: { id: egs.id, lastError: { startsWith: AUTH_ERROR_PREFIX } }, data: { lastError: null } });
    }
  } finally {
    await prisma.document.update({ where: { id: documentId }, data: { submittingSince: null } });
  }
}

export const issuanceService = {
  issue,
  submit,

  /** Issue, then submit. A submission failure never undoes the issue: the signed document is already committed. */
  async issueAndSubmit(businessId: string, documentId: string, opts: IssuanceOptions = {}) {
    await issue(businessId, documentId, opts);
    try {
      await submit(documentId, opts);
    } catch (err) {
      log.error('zatca.submit_failed', { documentId, error: err instanceof Error ? err.message : String(err) });
    }
  },

  /** Manual retry: only for an ISSUED document that is still PENDING_RETRY. */
  async retry(businessId: string, documentId: string, opts: IssuanceOptions = {}) {
    const doc = await prisma.document.findFirst({ where: { id: documentId, businessId }, select: { status: true, submissionStatus: true } });
    if (!doc) throw new NotFoundError('Document');
    if (doc.status !== 'ISSUED' || doc.submissionStatus !== 'PENDING_RETRY') {
      throw new ConflictError('Only documents pending retry can be resubmitted (NOT_PENDING_RETRY)', { code: 'NOT_PENDING_RETRY' });
    }
    await submit(documentId, opts);
  },

  /** Cron: PENDING_RETRY documents, least recently attempted first, one at a time. */
  async retryPending(opts: IssuanceOptions = {}) {
    const docs = await prisma.document.findMany({
      where: { status: 'ISSUED', submissionStatus: 'PENDING_RETRY' },
      // Least recently attempted first (never-tried on top), so a permanently failing document cannot hold the head of the queue.
      orderBy: [{ lastAttemptAt: { sort: 'asc', nulls: 'first' } }, { issuedAt: 'asc' }],
      take: MAX_BATCH,
      select: { id: true },
    });
    const started = Date.now();
    let processed = 0;
    for (const d of docs) {
      if (Date.now() - started >= (opts.budgetMs ?? CRON_BUDGET_MS)) break;
      processed++;
      try {
        await submit(d.id, opts);
      } catch (err) {
        log.error('zatca.retry_failed', { documentId: d.id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { processed };
  },
};
