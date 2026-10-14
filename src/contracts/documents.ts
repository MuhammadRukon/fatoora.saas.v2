import { DocumentKind, DocumentStatus, DocumentSubtype, SubmissionStatus, TaxCategory } from '@prisma/client';
import { z } from 'zod';

import { VATEX_REASONS } from '@/server/zatca/codes';

import { nullable, optionalArabic, text } from './business';
import { paginationQuerySchema } from './common';

export const MAX_LINES = 500;

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  INVOICE: 'Invoice',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
};
export const DOCUMENT_SUBTYPE_LABELS: Record<DocumentSubtype, string> = {
  STANDARD: 'Standard (B2B)',
  SIMPLIFIED: 'Simplified (B2C)',
};
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = { DRAFT: 'Draft', ISSUED: 'Issued' };
export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING_RETRY: 'Pending retry',
  REPORTED: 'Reported',
  CLEARED: 'Cleared',
  REJECTED: 'Rejected',
};
export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  S: 'Standard rate (15%)',
  Z: 'Zero-rated (0%)',
  E: 'Exempt',
  O: 'Out of scope',
};
/** UNTDID 4461 subset. */
export const PAYMENT_MEANS_LABELS: Record<string, string> = {
  '10': 'Cash',
  '30': 'Credit',
  '42': 'Bank account',
  '48': 'Bank card',
  '1': 'Instrument not defined',
};
/** Exemption reason codes per category (plan Appendix B), with the official text. */
export const EXEMPTION_REASONS: Record<'Z' | 'E' | 'O', { code: string; text: string }[]> = { Z: [], E: [], O: [] };
for (const [code, v] of Object.entries(VATEX_REASONS)) {
  if (v.category !== 'S') EXEMPTION_REASONS[v.category].push({ code, text: v.text });
}

const optionalDate = nullable(z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use YYYY-MM-DD'));

const halalas = z.number().int().min(0).max(2_147_483_647);

export const documentLineSchema = z.object({
  description: text(500),
  descriptionAr: optionalArabic,
  /** Decimal string, up to 6 decimals. */
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(z.string().regex(/^\d{1,12}(\.\d{1,6})?$/, 'A positive number, up to 6 decimals')),
  unitCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,3}$/, 'A UN/ECE unit code, e.g. PCE')
    .default('PCE'),
  unitPriceHalalas: halalas,
  lineDiscountHalalas: halalas.default(0),
  taxCategory: z.enum(TaxCategory),
  /** Basis points; omitted = the category default (S 1500, others 0). The engine rejects mismatches. */
  taxRateBp: z.number().int().min(0).max(10000).optional(),
  exemptionReasonCode: nullable(z.string().trim().max(30)),
  exemptionReason: nullable(z.string().trim().max(300)),
});
export type DocumentLineInput = z.input<typeof documentLineSchema>;

export const documentDraftSchema = z
  .object({
    kind: z.enum(DocumentKind),
    subtype: z.enum(DocumentSubtype),
    customerId: nullable(z.string().trim().max(60)),
    supplyDate: optionalDate,
    supplyEndDate: optionalDate,
    paymentMeansCode: nullable(
      z.string().trim().refine((v) => !v || v in PAYMENT_MEANS_LABELS, 'Unknown payment means'),
    ),
    docDiscountHalalas: halalas.default(0),
    docDiscountReason: nullable(z.string().trim().max(300)),
    lines: z.array(documentLineSchema).min(1, 'Add at least one line').max(MAX_LINES),
    billingReferenceId: nullable(z.string().trim().max(60)),
    noteReason: nullable(z.string().trim().max(300)),
    notes: nullable(z.string().trim().max(1000), true),
  })
  .superRefine((d, ctx) => {
    const need = (path: string, ok: unknown, message = 'Required') =>
      ok || ctx.addIssue({ code: 'custom', path: [path], message });
    if (d.kind !== 'INVOICE') {
      need('billingReferenceId', d.billingReferenceId, 'Pick the original invoice');
      need('noteReason', d.noteReason, 'A reason is required for credit and debit notes');
    }
    if (d.subtype === 'STANDARD') {
      need('customerId', d.customerId, 'A customer is required for standard invoices');
      need('supplyDate', d.supplyDate, 'Required for standard invoices');
    }
    if (d.supplyDate && d.supplyEndDate && d.supplyEndDate < d.supplyDate) {
      ctx.addIssue({ code: 'custom', path: ['supplyEndDate'], message: 'Must not be before the supply date' });
    }
    if (d.docDiscountHalalas > 0) need('docDiscountReason', d.docDiscountReason, 'Give a reason for the discount');
  });
export type DocumentDraftInput = z.input<typeof documentDraftSchema>;
export type DocumentDraftData = z.output<typeof documentDraftSchema>;

export const documentListQuerySchema = paginationQuerySchema.extend({
  kind: z.enum(DocumentKind).optional(),
  status: z.enum(DocumentStatus).optional(),
  submissionStatus: z.enum(SubmissionStatus).optional(),
  /** Matches the document number or the customer name. */
  q: z.string().trim().max(100).optional(),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

/** Seller or buyer frozen at issue (Phase 7); the live record is used for drafts. Feeds ZatcaParty. */
export interface PartySnapshot {
  name: string;
  nameAr?: string | null;
  vatNumber?: string | null;
  /** ZATCA scheme id ("CRN", "700", ...), already mapped from the Prisma enum. */
  idScheme?: string | null;
  idValue?: string | null;
  address: {
    street?: string | null;
    streetAr?: string | null;
    buildingNumber?: string | null;
    additionalNumber?: string | null;
    district?: string | null;
    districtAr?: string | null;
    city?: string | null;
    cityAr?: string | null;
    postalCode?: string | null;
    countryCode: string;
  };
}

export interface DocumentLineDTO {
  id: string;
  position: number;
  description: string;
  descriptionAr: string | null;
  quantity: string;
  unitCode: string;
  unitPriceHalalas: number;
  lineDiscountHalalas: number;
  taxCategory: TaxCategory;
  taxRateBp: number;
  exemptionReasonCode: string | null;
  exemptionReason: string | null;
  netHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
}

export interface DocumentTaxSubtotalDTO {
  taxCategory: TaxCategory;
  taxRateBp: number;
  taxableHalalas: number;
  taxHalalas: number;
  exemptionReasonCode?: string;
  exemptionReason?: string;
}

export interface DocumentDTO {
  id: string;
  kind: DocumentKind;
  subtype: DocumentSubtype;
  status: DocumentStatus;
  number: string | null;
  sequence: number | null;
  customerId: string | null;
  seller: PartySnapshot;
  buyer: PartySnapshot | null;
  issueDate: string | null;
  issueTime: string | null;
  issuedAt: string | null;
  supplyDate: string | null;
  supplyEndDate: string | null;
  currency: string;
  paymentMeansCode: string | null;
  docDiscountHalalas: number;
  docDiscountReason: string | null;
  lineExtensionHalalas: number;
  allowanceTotalHalalas: number;
  taxExclusiveHalalas: number;
  taxHalalas: number;
  taxInclusiveHalalas: number;
  payableHalalas: number;
  billingReference: { id: string; number: string | null } | null;
  noteReason: string | null;
  notes: string | null;
  submissionStatus: SubmissionStatus;
  isTest: boolean;
  qrBase64: string | null;
  uuid: string | null;
  icv: number | null;
  hasWarnings: boolean;
  submissionAttempts: number;
  lastAttemptAt: string | null;
  /** ZATCA's error and warning texts from the last response (never raw bodies). */
  submissionErrors: string[];
  submissionWarnings: string[];
  /** The EGS credentials were refused by ZATCA: the user must onboard again. */
  reonboardRequired: boolean;
  createdAt: string;
  updatedAt: string;
  lines: DocumentLineDTO[];
  taxSubtotals: DocumentTaxSubtotalDTO[];
}

export interface DocumentListItemDTO {
  id: string;
  kind: DocumentKind;
  subtype: DocumentSubtype;
  status: DocumentStatus;
  number: string | null;
  customerName: string | null;
  issueDate: string | null;
  createdAt: string;
  payableHalalas: number;
  submissionStatus: SubmissionStatus;
  isTest: boolean;
}
