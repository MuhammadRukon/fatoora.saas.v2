import { describe, expect, it } from 'vitest';
import { NS, parseXml } from '../hash';
import { buildUnsignedInvoiceXml } from '../xml/ubl-builder';
import { simplifiedInvoice, standardCreditNote, standardInvoice } from './fixtures';

const rootChildren = (xml: string) => {
  const root = parseXml(xml).documentElement!;
  return Array.from({ length: root.childNodes.length }, (_, i) => root.childNodes.item(i)!)
    .filter((n) => n.nodeType === 1)
    .map((n) => n.nodeName);
};

describe('buildUnsignedInvoiceXml', () => {
  it('is deterministic for the same input', () => {
    expect(buildUnsignedInvoiceXml(standardCreditNote)).toBe(buildUnsignedInvoiceXml(structuredClone(standardCreditNote)));
  });

  it('builds a standard credit note with type code, billing reference and reason (AC5.6)', () => {
    const xml = buildUnsignedInvoiceXml(standardCreditNote);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>');
    expect(xml).toMatch(/<cac:BillingReference>\s*<cac:InvoiceDocumentReference>\s*<cbc:ID>INV-000002<\/cbc:ID>/);
    expect(xml).toContain('<cbc:InstructionNote>Price correction</cbc:InstructionNote>');
  });

  it('orders root elements per the UBL 2.1 Invoice sequence', () => {
    // Order: UBL 2.1 InvoiceType XSD sequence (plan Phase 5 step 3).
    expect(rootChildren(buildUnsignedInvoiceXml(standardCreditNote))).toEqual([
      'ext:UBLExtensions',
      'cbc:ProfileID',
      'cbc:ID',
      'cbc:UUID',
      'cbc:IssueDate',
      'cbc:IssueTime',
      'cbc:InvoiceTypeCode',
      'cbc:Note',
      'cbc:DocumentCurrencyCode',
      'cbc:TaxCurrencyCode',
      'cac:BillingReference',
      'cac:AdditionalDocumentReference',
      'cac:AdditionalDocumentReference',
      'cac:AdditionalDocumentReference',
      'cac:Signature',
      'cac:AccountingSupplierParty',
      'cac:AccountingCustomerParty',
      'cac:Delivery',
      'cac:PaymentMeans',
      'cac:TaxTotal',
      'cac:TaxTotal',
      'cac:LegalMonetaryTotal',
      'cac:InvoiceLine',
      'cac:InvoiceLine',
    ]);
  });

  it('writes amounts with two decimals, the simplified subtype and exemption reasons', () => {
    const xml = buildUnsignedInvoiceXml(simplifiedInvoice);
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="SAR">280.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:RoundingAmount currencyID="SAR">230.00</cbc:RoundingAmount>');
    expect(xml).toContain('<cbc:Percent>15.00</cbc:Percent>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-32</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:ID>ICV</cbc:ID>\n        <cbc:UUID>1</cbc:UUID>');
    expect(xml).not.toContain('cac:BillingReference');
    expect(xml).not.toContain('cac:Delivery');
  });

  it('escapes text and keeps Arabic as UTF-8 characters', () => {
    const doc = parseXml(buildUnsignedInvoiceXml(standardInvoice));
    const names = doc.getElementsByTagNameNS(NS.cbc, 'RegistrationName');
    expect(names.item(1)!.textContent).toBe('Buyer & Sons');
    expect(names.item(0)!.textContent).toBe('شركة الاختبار | Test Co');
  });

  it('adds a document allowance with its tax category', () => {
    const xml = buildUnsignedInvoiceXml({
      ...simplifiedInvoice,
      lines: [simplifiedInvoice.lines[0]],
      taxSubtotals: [{ ...simplifiedInvoice.taxSubtotals[0], taxableHalalas: 19000, taxHalalas: 2850 }],
      docDiscount: { amountHalalas: 1000, reason: 'discount', taxCategory: 'S', taxRateBp: 1500 },
      totals: { lineExtensionHalalas: 20000, allowanceTotalHalalas: 1000, taxExclusiveHalalas: 19000, taxHalalas: 2850, taxInclusiveHalalas: 21850, payableHalalas: 21850 },
    });
    expect(xml).toMatch(
      /<cac:AllowanceCharge>\s*<cbc:ChargeIndicator>false<\/cbc:ChargeIndicator>\s*<cbc:AllowanceChargeReason>discount<\/cbc:AllowanceChargeReason>\s*<cbc:Amount currencyID="SAR">10.00<\/cbc:Amount>\s*<cac:TaxCategory>\s*<cbc:ID schemeID="UN\/ECE 5305" schemeAgencyID="6">S<\/cbc:ID>/,
    );
    expect(rootChildren(xml).indexOf('cac:AllowanceCharge')).toBe(rootChildren(xml).indexOf('cac:TaxTotal') - 1);
  });

  it('adds a line allowance before the line TaxTotal only when the line has a discount', () => {
    const line = { ...simplifiedInvoice.lines[0], discountHalalas: 150 };
    const xml = buildUnsignedInvoiceXml({ ...simplifiedInvoice, lines: [line] });
    expect(xml).toMatch(/<cbc:LineExtensionAmount currencyID="SAR">200.00<\/cbc:LineExtensionAmount>\s*<cac:AllowanceCharge>[\s\S]*?1.50[\s\S]*?<\/cac:AllowanceCharge>\s*<cac:TaxTotal>/);
    expect(buildUnsignedInvoiceXml(simplifiedInvoice)).not.toContain('<cac:AllowanceCharge>');
  });

  it('rejects non-integer halalas', () => {
    expect(() =>
      buildUnsignedInvoiceXml({ ...simplifiedInvoice, totals: { ...simplifiedInvoice.totals, taxHalalas: 1.5 } }),
    ).toThrow();
  });
});
