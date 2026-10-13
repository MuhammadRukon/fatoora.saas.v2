import {
  INVOICE_SUBTYPE_NAME,
  INVOICE_TYPE_CODE,
  type TaxCategoryCode,
  type ZatcaKind,
  type ZatcaSubtype,
} from '../codes';
import { NS } from '../hash';

export type ZatcaAddress = {
  street: string;
  additionalStreet?: string;
  buildingNumber?: string;
  additionalNumber?: string; // PlotIdentification
  district?: string; // CitySubdivisionName
  city: string;
  postalCode?: string;
  countrySubentity?: string;
  countryCode: string;
};

export type ZatcaParty = {
  name: string;
  vatNumber?: string;
  idScheme?: string; // BT-29-1 / BT-46-1 (codes.ts)
  id?: string;
  address?: ZatcaAddress;
};

export type ZatcaLineInput = {
  name: string;
  quantity: string; // decimal string, e.g. "0.5"
  unitCode: string;
  unitPriceHalalas: number;
  discountHalalas?: number; // line allowance (BG-27)
  netHalalas: number; // BT-131
  vatHalalas: number; // KSA-11
  totalHalalas: number; // KSA-12
  taxCategory: TaxCategoryCode;
  taxRateBp: number;
};

export type ZatcaTaxSubtotal = {
  taxCategory: TaxCategoryCode;
  taxRateBp: number;
  taxableHalalas: number;
  taxHalalas: number;
  exemptionReasonCode?: string;
  exemptionReason?: string;
};

export type ZatcaDocumentInput = {
  kind: ZatcaKind;
  subtype: ZatcaSubtype;
  number: string;
  uuid: string;
  icv: number;
  pih: string;
  issueDate: string; // from toZatcaDateTime
  issueTime: string;
  seller: ZatcaParty & { vatNumber: string; address: ZatcaAddress };
  buyer?: ZatcaParty;
  supplyDate?: string;
  supplyEndDate?: string;
  paymentMeansCode?: string;
  billingReference?: string; // original document number (BT-25)
  reason?: string; // KSA-10
  docDiscount?: { amountHalalas: number; reason: string; taxCategory: TaxCategoryCode; taxRateBp: number };
  lines: ZatcaLineInput[];
  taxSubtotals: ZatcaTaxSubtotal[];
  totals: {
    lineExtensionHalalas: number;
    allowanceTotalHalalas: number;
    taxExclusiveHalalas: number;
    taxHalalas: number;
    taxInclusiveHalalas: number;
    payableHalalas: number;
  };
};

// Placeholders spliced by signInvoice; never re-serialize the document.
export const UBL_EXTENSIONS_PLACEHOLDER = '<ext:UBLExtensions></ext:UBLExtensions>';
export const QR_PLACEHOLDER = '<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"></cbc:EmbeddedDocumentBinaryObject>';

// ---- tiny deterministic XML writer: 4-space indentation, leaf text inline (same layout as the samples) ----
type El = { name: string; attrs?: Record<string, string>; text?: string; children?: (El | null | undefined | false)[]; raw?: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

function render(e: El, depth: number): string {
  const pad = '    '.repeat(depth);
  if (e.raw !== undefined) return pad + e.raw;
  const attrs = Object.entries(e.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join('');
  const kids = (e.children ?? []).filter((c): c is El => !!c);
  if (!kids.length) return `${pad}<${e.name}${attrs}>${esc(e.text ?? '')}</${e.name}>`;
  return `${pad}<${e.name}${attrs}>\n${kids.map((c) => render(c, depth + 1)).join('\n')}\n${pad}</${e.name}>`;
}

const el = (name: string, content?: string | (El | null | undefined | false)[], attrs?: Record<string, string>): El =>
  Array.isArray(content) ? { name, attrs, children: content } : { name, attrs, text: content ?? '' };

const opt = (name: string, v: string | undefined) => (v ? el(name, v) : null);

function amount(halalas: number): string {
  if (!Number.isSafeInteger(halalas) || halalas < 0) throw new Error(`Invalid halalas amount: ${halalas}`);
  return `${Math.floor(halalas / 100)}.${String(halalas % 100).padStart(2, '0')}`;
}
const money = (name: string, halalas: number) => el(name, amount(halalas), { currencyID: 'SAR' });
const percent = (bp: number) => amount(bp); // basis points -> "15.00"

const UNECE_5305 = { schemeID: 'UN/ECE 5305', schemeAgencyID: '6' };
const UNECE_5153 = { schemeID: 'UN/ECE 5153', schemeAgencyID: '6' };

function taxCategory(name: string, category: TaxCategoryCode, rateBp: number, extra: El[] = [], schemed = true): El {
  return el(name, [
    el('cbc:ID', category, schemed ? UNECE_5305 : undefined),
    el('cbc:Percent', percent(rateBp)),
    ...extra,
    el('cac:TaxScheme', [el('cbc:ID', 'VAT', schemed ? UNECE_5153 : undefined)]),
  ]);
}

function party(wrapper: string, p: ZatcaParty | undefined): El {
  if (!p) return el(wrapper);
  const a = p.address;
  return el(wrapper, [
    el('cac:Party', [
      p.id && p.idScheme ? el('cac:PartyIdentification', [el('cbc:ID', p.id, { schemeID: p.idScheme })]) : null,
      a &&
        el('cac:PostalAddress', [
          el('cbc:StreetName', a.street),
          opt('cbc:AdditionalStreetName', a.additionalStreet),
          opt('cbc:BuildingNumber', a.buildingNumber),
          opt('cbc:PlotIdentification', a.additionalNumber),
          opt('cbc:CitySubdivisionName', a.district),
          el('cbc:CityName', a.city),
          opt('cbc:PostalZone', a.postalCode),
          opt('cbc:CountrySubentity', a.countrySubentity),
          el('cac:Country', [el('cbc:IdentificationCode', a.countryCode)]),
        ]),
      el('cac:PartyTaxScheme', [opt('cbc:CompanyID', p.vatNumber), el('cac:TaxScheme', [el('cbc:ID', 'VAT')])]),
      el('cac:PartyLegalEntity', [el('cbc:RegistrationName', p.name)]),
    ]),
  ]);
}

const attachment = (value: El) => el('cac:Attachment', [value]);

export function buildUnsignedInvoiceXml(d: ZatcaDocumentInput): string {
  const isNote = d.kind !== 'INVOICE';
  const delivery = !!(d.supplyDate || d.supplyEndDate);
  const children: (El | null | undefined | false)[] = [
    { name: '', raw: UBL_EXTENSIONS_PLACEHOLDER },
    el('cbc:ProfileID', 'reporting:1.0'),
    el('cbc:ID', d.number),
    el('cbc:UUID', d.uuid),
    el('cbc:IssueDate', d.issueDate),
    el('cbc:IssueTime', d.issueTime),
    el('cbc:InvoiceTypeCode', INVOICE_TYPE_CODE[d.kind], { name: INVOICE_SUBTYPE_NAME[d.subtype] }),
    isNote && opt('cbc:Note', d.reason),
    el('cbc:DocumentCurrencyCode', 'SAR'),
    el('cbc:TaxCurrencyCode', 'SAR'),
    isNote && !!d.billingReference && el('cac:BillingReference', [el('cac:InvoiceDocumentReference', [el('cbc:ID', d.billingReference)])]),
    el('cac:AdditionalDocumentReference', [el('cbc:ID', 'ICV'), el('cbc:UUID', String(d.icv))]),
    el('cac:AdditionalDocumentReference', [
      el('cbc:ID', 'PIH'),
      attachment(el('cbc:EmbeddedDocumentBinaryObject', d.pih, { mimeCode: 'text/plain' })),
    ]),
    el('cac:AdditionalDocumentReference', [el('cbc:ID', 'QR'), attachment({ name: '', raw: QR_PLACEHOLDER })]),
    el('cac:Signature', [
      el('cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice'),
      el('cbc:SignatureMethod', 'urn:oasis:names:specification:ubl:dsig:enveloped:xades'),
    ]),
    party('cac:AccountingSupplierParty', d.seller),
    party('cac:AccountingCustomerParty', d.buyer),
    delivery && el('cac:Delivery', [opt('cbc:ActualDeliveryDate', d.supplyDate), opt('cbc:LatestDeliveryDate', d.supplyEndDate)]),
    (!!d.paymentMeansCode || isNote) &&
      el('cac:PaymentMeans', [opt('cbc:PaymentMeansCode', d.paymentMeansCode), isNote && opt('cbc:InstructionNote', d.reason)]),
    d.docDiscount &&
      el('cac:AllowanceCharge', [
        el('cbc:ChargeIndicator', 'false'),
        el('cbc:AllowanceChargeReason', d.docDiscount.reason),
        money('cbc:Amount', d.docDiscount.amountHalalas),
        taxCategory('cac:TaxCategory', d.docDiscount.taxCategory, d.docDiscount.taxRateBp),
      ]),
    el('cac:TaxTotal', [money('cbc:TaxAmount', d.totals.taxHalalas)]),
    el('cac:TaxTotal', [
      money('cbc:TaxAmount', d.totals.taxHalalas),
      ...d.taxSubtotals.map((s) =>
        el('cac:TaxSubtotal', [
          money('cbc:TaxableAmount', s.taxableHalalas),
          money('cbc:TaxAmount', s.taxHalalas),
          taxCategory('cac:TaxCategory', s.taxCategory, s.taxRateBp, [
            opt('cbc:TaxExemptionReasonCode', s.exemptionReasonCode),
            opt('cbc:TaxExemptionReason', s.exemptionReason),
          ].filter((x): x is El => !!x)),
        ]),
      ),
    ]),
    el('cac:LegalMonetaryTotal', [
      money('cbc:LineExtensionAmount', d.totals.lineExtensionHalalas),
      money('cbc:TaxExclusiveAmount', d.totals.taxExclusiveHalalas),
      money('cbc:TaxInclusiveAmount', d.totals.taxInclusiveHalalas),
      money('cbc:AllowanceTotalAmount', d.totals.allowanceTotalHalalas),
      money('cbc:PrepaidAmount', 0),
      money('cbc:PayableAmount', d.totals.payableHalalas),
    ]),
    ...d.lines.map((l, i) =>
      el('cac:InvoiceLine', [
        el('cbc:ID', String(i + 1)),
        el('cbc:InvoicedQuantity', l.quantity, { unitCode: l.unitCode }),
        money('cbc:LineExtensionAmount', l.netHalalas),
        !!l.discountHalalas &&
          el('cac:AllowanceCharge', [
            el('cbc:ChargeIndicator', 'false'),
            el('cbc:AllowanceChargeReason', 'discount'),
            money('cbc:Amount', l.discountHalalas),
          ]),
        el('cac:TaxTotal', [money('cbc:TaxAmount', l.vatHalalas), money('cbc:RoundingAmount', l.totalHalalas)]),
        el('cac:Item', [el('cbc:Name', l.name), taxCategory('cac:ClassifiedTaxCategory', l.taxCategory, l.taxRateBp, [], false)]),
        el('cac:Price', [money('cbc:PriceAmount', l.unitPriceHalalas)]),
      ]),
    ),
  ];
  const root = el('Invoice', children, { xmlns: NS.invoice, 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc, 'xmlns:ext': NS.ext });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${render(root, 0)}`;
}
