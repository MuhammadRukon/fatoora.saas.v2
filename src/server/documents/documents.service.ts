import { Prisma, type Business, type Customer, type Document, type DocumentLine } from '@prisma/client';

import type {
  DocumentDTO,
  DocumentDraftData,
  DocumentListItemDTO,
  DocumentListQuery,
  PartySnapshot,
} from '@/contracts/documents';
import { prisma } from '@/lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/server/common/errors';
import { clampLimit, type CursorPage } from '@/server/common/pagination';

import { summarizeValidation } from '@/server/zatca';

import { buyerParty, sellerParty } from './parties';
import { computeDocument, STANDARD_RATE_BP } from './vat-engine';

type DocumentRow = Document & {
  lines: DocumentLine[];
  business: Business;
  customer: Customer | null;
  billingReference: { id: string; number: string | null } | null;
  egsUnit: { lastError: string | null } | null;
};

const include = {
  lines: { orderBy: { position: 'asc' } },
  business: true,
  customer: true,
  billingReference: { select: { id: true, number: true } },
  egsUnit: { select: { lastError: true } },
} satisfies Prisma.DocumentInclude;

const dayString = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
const dayDate = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Issued documents show their frozen snapshots; drafts the live seller and customer. */
function toDTO(d: DocumentRow): DocumentDTO {
  const computed = computeDocument({
    lines: d.lines.map((l) => ({
      quantity: l.quantity.toString(),
      unitPriceHalalas: l.unitPriceHalalas,
      lineDiscountHalalas: l.lineDiscountHalalas,
      taxCategory: l.taxCategory,
      taxRateBp: l.taxRateBp,
      exemptionReasonCode: l.exemptionReasonCode,
      exemptionReason: l.exemptionReason,
    })),
    docDiscountHalalas: d.docDiscountHalalas,
  });
  const verdict = summarizeValidation(d.zatcaResponse);
  return {
    id: d.id,
    kind: d.kind,
    subtype: d.subtype,
    status: d.status,
    number: d.number,
    sequence: d.sequence,
    customerId: d.customerId,
    seller: (d.sellerSnapshot as PartySnapshot | null) ?? sellerParty(d.business),
    buyer: (d.buyerSnapshot as PartySnapshot | null) ?? (d.customer ? buyerParty(d.customer) : null),
    issueDate: dayString(d.issueDate),
    issueTime: d.issueTime,
    issuedAt: iso(d.issuedAt),
    supplyDate: dayString(d.supplyDate),
    supplyEndDate: dayString(d.supplyEndDate),
    currency: d.currency,
    paymentMeansCode: d.paymentMeansCode,
    docDiscountHalalas: d.docDiscountHalalas,
    docDiscountReason: d.docDiscountReason,
    lineExtensionHalalas: d.lineExtensionHalalas,
    allowanceTotalHalalas: d.allowanceTotalHalalas,
    taxExclusiveHalalas: d.taxExclusiveHalalas,
    taxHalalas: d.taxHalalas,
    taxInclusiveHalalas: d.taxInclusiveHalalas,
    payableHalalas: d.payableHalalas,
    billingReference: d.billingReference,
    noteReason: d.noteReason,
    notes: d.notes,
    submissionStatus: d.submissionStatus,
    isTest: d.isTest,
    qrBase64: d.qrBase64,
    uuid: d.uuid,
    icv: d.icv,
    hasWarnings: d.hasWarnings,
    submissionAttempts: d.submissionAttempts,
    lastAttemptAt: iso(d.lastAttemptAt),
    submissionErrors: verdict.errorMessages,
    submissionWarnings: verdict.warningMessages,
    reonboardRequired: d.submissionStatus === 'PENDING_RETRY' && !!d.egsUnit?.lastError?.includes('re-onboard required'),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    lines: d.lines.map((l) => ({
      id: l.id,
      position: l.position,
      description: l.description,
      descriptionAr: l.descriptionAr,
      quantity: l.quantity.toString(),
      unitCode: l.unitCode,
      unitPriceHalalas: l.unitPriceHalalas,
      lineDiscountHalalas: l.lineDiscountHalalas,
      taxCategory: l.taxCategory,
      taxRateBp: l.taxRateBp,
      exemptionReasonCode: l.exemptionReasonCode,
      exemptionReason: l.exemptionReason,
      netHalalas: l.netHalalas,
      vatHalalas: l.vatHalalas,
      totalHalalas: l.totalHalalas,
    })),
    taxSubtotals: computed.taxSubtotals,
  };
}

/** Totals and line amounts always come from the engine; client-sent amounts do not exist in the contract. */
function compute(data: DocumentDraftData) {
  const computed = computeDocument({
    lines: data.lines.map((l) => ({
      ...l,
      taxRateBp: l.taxRateBp ?? (l.taxCategory === 'S' ? STANDARD_RATE_BP : 0),
    })),
    docDiscountHalalas: data.docDiscountHalalas,
  });
  const lines = data.lines.map((l, i) => ({
    position: i + 1,
    description: l.description,
    descriptionAr: l.descriptionAr,
    quantity: l.quantity,
    unitCode: l.unitCode,
    unitPriceHalalas: l.unitPriceHalalas,
    lineDiscountHalalas: l.lineDiscountHalalas,
    taxCategory: l.taxCategory,
    taxRateBp: l.taxRateBp ?? (l.taxCategory === 'S' ? STANDARD_RATE_BP : 0),
    // Only Z/E carry a code and only O the free text; stale values from a category switch are dropped.
    exemptionReasonCode: l.taxCategory === 'Z' || l.taxCategory === 'E' ? l.exemptionReasonCode : null,
    exemptionReason: l.taxCategory === 'O' ? l.exemptionReason : null,
    ...computed.lines[i],
  }));
  return { lines, totals: computed.totals };
}

/** Checks the customer and the original invoice belong to this business (404 otherwise) and fit the note. */
async function checkReferences(tx: Prisma.TransactionClient, businessId: string, data: DocumentDraftData) {
  if (data.customerId && !(await tx.customer.findFirst({ where: { id: data.customerId, businessId }, select: { id: true } }))) {
    throw new NotFoundError('Customer');
  }
  if (data.kind === 'INVOICE') return null;
  const original = await tx.document.findFirst({
    where: { id: data.billingReferenceId!, businessId },
    select: { id: true, kind: true, subtype: true, status: true },
  });
  if (!original) throw new NotFoundError('Original invoice');
  if (original.status !== 'ISSUED') {
    throw new ConflictError('The original invoice is not issued yet (ORIGINAL_NOT_ISSUED)', { code: 'ORIGINAL_NOT_ISSUED' });
  }
  if (original.kind !== 'INVOICE') {
    throw new ValidationError('A note must reference an invoice, not another note (ORIGINAL_NOT_INVOICE)', { code: 'ORIGINAL_NOT_INVOICE' });
  }
  if (original.subtype !== data.subtype) {
    throw new ValidationError('The note must have the same type as the original invoice (ORIGINAL_SUBTYPE_MISMATCH)', {
      code: 'ORIGINAL_SUBTYPE_MISMATCH',
    });
  }
  return original.id;
}

function draftColumns(data: DocumentDraftData, totals: ReturnType<typeof compute>['totals'], billingReferenceId: string | null) {
  return {
    kind: data.kind,
    subtype: data.subtype,
    customerId: data.customerId,
    supplyDate: dayDate(data.supplyDate),
    supplyEndDate: dayDate(data.supplyEndDate),
    paymentMeansCode: data.paymentMeansCode,
    docDiscountHalalas: data.docDiscountHalalas,
    docDiscountReason: data.docDiscountHalalas > 0 ? data.docDiscountReason : null,
    billingReferenceId,
    noteReason: data.kind === 'INVOICE' ? null : data.noteReason,
    notes: data.notes,
    ...totals,
  };
}

async function loadInTx(tx: Prisma.TransactionClient, businessId: string, id: string) {
  const row = await tx.document.findFirst({ where: { id, businessId }, include });
  if (!row) throw new NotFoundError('Document');
  return row;
}

const immutable = () =>
  new ConflictError('Issued documents cannot be changed (DOCUMENT_IMMUTABLE)', { code: 'DOCUMENT_IMMUTABLE' });

/** Every query is scoped by businessId (from resolveBusinessId, never from the client). */
export const documentsService = {
  createDraft(businessId: string, data: DocumentDraftData): Promise<DocumentDTO> {
    const { lines, totals } = compute(data);
    return prisma.$transaction(async (tx) => {
      const billingReferenceId = await checkReferences(tx, businessId, data);
      const created = await tx.document.create({
        data: { ...draftColumns(data, totals, billingReferenceId), businessId, lines: { create: lines } },
        select: { id: true },
      });
      return toDTO(await loadInTx(tx, businessId, created.id));
    });
  },

  updateDraft(businessId: string, id: string, data: DocumentDraftData): Promise<DocumentDTO> {
    const { lines, totals } = compute(data);
    return prisma.$transaction(async (tx) => {
      const current = await loadInTx(tx, businessId, id);
      if (current.status !== 'DRAFT') throw immutable();
      const billingReferenceId = await checkReferences(tx, businessId, data);
      // The status guard keeps this safe if the document is issued between the read and the write.
      const { count } = await tx.document.updateMany({
        where: { id, businessId, status: 'DRAFT' },
        data: draftColumns(data, totals, billingReferenceId),
      });
      if (!count) throw immutable();
      await tx.documentLine.deleteMany({ where: { documentId: id } });
      await tx.documentLine.createMany({ data: lines.map((l) => ({ ...l, documentId: id })) });
      return toDTO(await loadInTx(tx, businessId, id));
    });
  },

  async deleteDraft(businessId: string, id: string) {
    const { count } = await prisma.document.deleteMany({ where: { id, businessId, status: 'DRAFT' } });
    if (count) return;
    const exists = await prisma.document.findFirst({ where: { id, businessId }, select: { id: true } });
    throw exists ? immutable() : new NotFoundError('Document');
  },

  async get(businessId: string, id: string): Promise<DocumentDTO> {
    const row = await prisma.document.findFirst({ where: { id, businessId }, include });
    if (!row) throw new NotFoundError('Document');
    return toDTO(row);
  },

  /** The legal XML of an ISSUED document: ZATCA's cleared copy when there is one, else our signed copy. */
  async getXml(businessId: string, id: string) {
    const d = await prisma.document.findFirst({
      where: { id, businessId },
      select: { status: true, number: true, signedXml: true, clearedXml: true },
    });
    if (!d) throw new NotFoundError('Document');
    const xml = d.clearedXml ?? d.signedXml;
    if (d.status !== 'ISSUED' || !xml || !d.number) {
      throw new ConflictError('Only issued documents have an XML (NOT_ISSUED)', { code: 'NOT_ISSUED' });
    }
    return { number: d.number, xml };
  },

  async list(
    businessId: string,
    { kind, status, submissionStatus, q, cursor, limit }: DocumentListQuery,
  ): Promise<CursorPage<DocumentListItemDTO>> {
    const take = clampLimit(limit);
    const where: Prisma.DocumentWhereInput = { businessId, kind, status, submissionStatus };
    if (q) {
      where.OR = [
        { number: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    const rows = await prisma.document.findMany({
      where,
      include: { customer: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take).map((d) => ({
      id: d.id,
      kind: d.kind,
      subtype: d.subtype,
      status: d.status,
      number: d.number,
      customerName: (d.buyerSnapshot as PartySnapshot | null)?.name ?? d.customer?.name ?? null,
      issueDate: dayString(d.issueDate),
      createdAt: d.createdAt.toISOString(),
      payableHalalas: d.payableHalalas,
      submissionStatus: d.submissionStatus,
      isTest: d.isTest,
    }));
    return { items, nextCursor: rows.length > take ? items[items.length - 1].id : null };
  },

  /** Copies a document (any status) into a new DRAFT, e.g. to correct a rejected one. */
  async duplicateAsDraft(businessId: string, id: string): Promise<DocumentDTO> {
    const src = await prisma.document.findFirst({ where: { id, businessId }, include: { lines: { orderBy: { position: 'asc' } } } });
    if (!src) throw new NotFoundError('Document');
    return documentsService.createDraft(businessId, {
      kind: src.kind,
      subtype: src.subtype,
      customerId: src.customerId,
      supplyDate: dayString(src.supplyDate),
      supplyEndDate: dayString(src.supplyEndDate),
      paymentMeansCode: src.paymentMeansCode,
      docDiscountHalalas: src.docDiscountHalalas,
      docDiscountReason: src.docDiscountReason,
      billingReferenceId: src.billingReferenceId,
      noteReason: src.noteReason,
      notes: src.notes,
      lines: src.lines.map((l) => ({
        description: l.description,
        descriptionAr: l.descriptionAr,
        quantity: l.quantity.toString(),
        unitCode: l.unitCode,
        unitPriceHalalas: l.unitPriceHalalas,
        lineDiscountHalalas: l.lineDiscountHalalas,
        taxCategory: l.taxCategory,
        taxRateBp: l.taxRateBp,
        exemptionReasonCode: l.exemptionReasonCode,
        exemptionReason: l.exemptionReason,
      })),
    });
  },
};
