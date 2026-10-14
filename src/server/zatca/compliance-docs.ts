import { randomUUID } from 'node:crypto';

import { PIH_SEED } from './hash';
import { signInvoice } from './sign';
import { toZatcaDateTime } from './time';
import type { ZatcaKind, ZatcaSubtype } from './codes';
import { buildUnsignedInvoiceXml, type ZatcaDocumentInput, type ZatcaParty } from './xml/ubl-builder';

// ZATCA's published sample buyer VAT; the buyer is a fixed synthetic party (standard documents need a full Saudi address).
const TEST_BUYER: ZatcaParty = {
  name: 'Compliance Test Buyer',
  vatNumber: '399999999800003',
  address: {
    street: 'Prince Sultan Street',
    buildingNumber: '2322',
    additionalNumber: '2323',
    district: 'Al Murabba',
    city: 'Riyadh',
    postalCode: '23333',
    countryCode: 'SA',
  },
};

// One line, 100.00 SAR + 15% VAT = 115.00.
const LINE = {
  name: 'Compliance test item',
  quantity: '1',
  unitCode: 'PCE',
  unitPriceHalalas: 10000,
  netHalalas: 10000,
  vatHalalas: 1500,
  totalHalalas: 11500,
  taxCategory: 'S',
  taxRateBp: 1500,
} as const;
const TOTALS = {
  lineExtensionHalalas: 10000,
  allowanceTotalHalalas: 0,
  taxExclusiveHalalas: 10000,
  taxHalalas: 1500,
  taxInclusiveHalalas: 11500,
  payableHalalas: 11500,
};

// Each note references the invoice of its subtype (index into the first two entries).
const PLAN: { kind: ZatcaKind; subtype: ZatcaSubtype; number: string; refers?: number }[] = [
  { kind: 'INVOICE', subtype: 'STANDARD', number: 'CMP-INV-S-1' },
  { kind: 'INVOICE', subtype: 'SIMPLIFIED', number: 'CMP-INV-B-1' },
  { kind: 'CREDIT_NOTE', subtype: 'STANDARD', number: 'CMP-CN-S-1', refers: 0 },
  { kind: 'DEBIT_NOTE', subtype: 'STANDARD', number: 'CMP-DN-S-1', refers: 0 },
  { kind: 'CREDIT_NOTE', subtype: 'SIMPLIFIED', number: 'CMP-CN-B-1', refers: 1 },
  { kind: 'DEBIT_NOTE', subtype: 'SIMPLIFIED', number: 'CMP-DN-B-1', refers: 1 },
];

export type ComplianceDoc = {
  label: string;
  kind: ZatcaKind;
  subtype: ZatcaSubtype;
  icv: number;
  uuid: string;
  invoiceHash: string;
  signedXml: string;
  /** The /compliance/invoices request body. */
  payload: { invoiceHash: string; uuid: string; invoice: string };
};

/**
 * The 6 synthetic documents the compliance CSID must clear (standard + simplified invoice, and a credit and debit
 * note for each, billed against its invoice). ICV 1..6 chained from the PIH seed, signed with the compliance cert.
 * Pure: the caller supplies the seller, keys, clock and (optionally) the uuid source.
 */
export function buildComplianceDocuments(input: {
  seller: ZatcaDocumentInput['seller'];
  privateKeyPem: string;
  certificatePem: string;
  now: Date;
  uuid?: () => string;
}): ComplianceDoc[] {
  const { issueDate, issueTime } = toZatcaDateTime(input.now);
  let pih = PIH_SEED;
  return PLAN.map((p, i) => {
    const uuid = (input.uuid ?? randomUUID)();
    const isNote = p.kind !== 'INVOICE';
    const doc: ZatcaDocumentInput = {
      kind: p.kind,
      subtype: p.subtype,
      number: p.number,
      uuid,
      icv: i + 1,
      pih,
      issueDate,
      issueTime,
      seller: input.seller,
      buyer: p.subtype === 'STANDARD' ? TEST_BUYER : undefined,
      supplyDate: p.subtype === 'STANDARD' ? issueDate : undefined,
      paymentMeansCode: '10',
      billingReference: p.refers === undefined ? undefined : PLAN[p.refers].number,
      reason: isNote ? 'Compliance test' : undefined,
      lines: [LINE],
      taxSubtotals: [{ taxCategory: 'S', taxRateBp: 1500, taxableHalalas: 10000, taxHalalas: 1500 }],
      totals: TOTALS,
    };
    const signed = signInvoice({
      xml: buildUnsignedInvoiceXml(doc),
      privateKeyPem: input.privateKeyPem,
      certificatePem: input.certificatePem,
      signingTime: input.now,
    });
    pih = signed.invoiceHash;
    return {
      label: `${p.subtype} ${p.kind}`,
      kind: p.kind,
      subtype: p.subtype,
      icv: i + 1,
      uuid,
      invoiceHash: signed.invoiceHash,
      signedXml: signed.signedXml,
      payload: {
        invoiceHash: signed.invoiceHash,
        uuid,
        invoice: Buffer.from(signed.signedXml, 'utf8').toString('base64'),
      },
    };
  });
}
