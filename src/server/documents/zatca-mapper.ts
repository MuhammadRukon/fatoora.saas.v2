import type { DocumentKind, DocumentSubtype } from '@prisma/client';

import type { PartySnapshot } from '@/contracts/documents';
import type { TaxCategoryCode, ZatcaAddress, ZatcaDocumentInput, ZatcaParty } from '@/server/zatca';

import { computeDocument, type EngineLineInput } from './vat-engine';

export interface MapLine extends EngineLineInput {
  description: string;
  unitCode: string;
}

export interface MapInput {
  kind: DocumentKind;
  subtype: DocumentSubtype;
  number: string;
  uuid: string;
  icv: number;
  pih: string;
  /** From toZatcaDateTime(now). */
  issueDate: string;
  issueTime: string;
  seller: PartySnapshot;
  buyer: PartySnapshot | null;
  supplyDate: string | null;
  supplyEndDate: string | null;
  paymentMeansCode: string | null;
  /** Number of the original invoice (notes only). */
  billingReferenceNumber: string | null;
  noteReason: string | null;
  docDiscountHalalas: number;
  docDiscountReason: string | null;
  lines: MapLine[];
}

const opt = (v?: string | null) => v || undefined;

function toAddress(a: PartySnapshot['address']): ZatcaAddress | undefined {
  // Simplified buyers may carry a partial address; the XML needs at least street and city.
  if (!a.street || !a.city) return undefined;
  return {
    street: a.street,
    buildingNumber: opt(a.buildingNumber),
    additionalNumber: opt(a.additionalNumber),
    district: opt(a.district),
    city: a.city,
    postalCode: opt(a.postalCode),
    countryCode: a.countryCode,
  };
}

/** The seller's registration name is the Arabic name, as in the onboarding compliance documents. */
export function toZatcaParty(p: PartySnapshot, arabicName = false): ZatcaParty {
  return {
    name: (arabicName && p.nameAr) || p.name,
    vatNumber: opt(p.vatNumber),
    idScheme: opt(p.idScheme),
    id: opt(p.idValue),
    address: toAddress(p.address),
  };
}

/** PartySnapshot + lines -> the pure ZATCA library's input. Amounts always come from the VAT engine. */
export function toZatcaInput(i: MapInput): ZatcaDocumentInput {
  const computed = computeDocument({ lines: i.lines, docDiscountHalalas: i.docDiscountHalalas });
  const seller = toZatcaParty(i.seller, true);
  const isNote = i.kind !== 'INVOICE';
  // A document discount requires one tax group (engine), so its tax category is that group's.
  const group = computed.taxSubtotals[0];
  return {
    kind: i.kind,
    subtype: i.subtype,
    number: i.number,
    uuid: i.uuid,
    icv: i.icv,
    pih: i.pih,
    issueDate: i.issueDate,
    issueTime: i.issueTime,
    seller: { ...seller, vatNumber: seller.vatNumber!, address: seller.address! },
    buyer: i.buyer ? toZatcaParty(i.buyer) : undefined,
    supplyDate: opt(i.supplyDate),
    supplyEndDate: opt(i.supplyEndDate),
    paymentMeansCode: opt(i.paymentMeansCode),
    billingReference: isNote ? opt(i.billingReferenceNumber) : undefined,
    reason: isNote ? opt(i.noteReason) : undefined,
    docDiscount:
      i.docDiscountHalalas > 0
        ? {
            amountHalalas: i.docDiscountHalalas,
            reason: i.docDiscountReason ?? 'discount',
            taxCategory: group.taxCategory as TaxCategoryCode,
            taxRateBp: group.taxRateBp,
          }
        : undefined,
    lines: i.lines.map((l, n) => ({
      name: l.description,
      quantity: l.quantity,
      unitCode: l.unitCode,
      unitPriceHalalas: l.unitPriceHalalas,
      discountHalalas: l.lineDiscountHalalas || undefined,
      netHalalas: computed.lines[n].netHalalas,
      vatHalalas: computed.lines[n].vatHalalas,
      totalHalalas: computed.lines[n].totalHalalas,
      taxCategory: l.taxCategory,
      taxRateBp: l.taxRateBp,
    })),
    taxSubtotals: computed.taxSubtotals,
    totals: computed.totals,
  };
}
