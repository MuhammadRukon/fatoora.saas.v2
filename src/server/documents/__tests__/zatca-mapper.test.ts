import { describe, expect, it } from 'vitest';

import type { PartySnapshot } from '@/contracts/documents';
import { buildUnsignedInvoiceXml, toZatcaDateTime } from '@/server/zatca';

import { toZatcaInput, type MapInput } from '../zatca-mapper';

const seller: PartySnapshot = {
  name: 'Test Co',
  nameAr: 'شركة الاختبار',
  vatNumber: '300000000000003',
  idScheme: 'CRN',
  idValue: '1010010000',
  address: { street: 'King Fahd Road', buildingNumber: '1234', district: 'Al Olaya', city: 'Riyadh', postalCode: '12345', countryCode: 'SA' },
};
const buyer: PartySnapshot = {
  name: 'Acme',
  vatNumber: '310000000000003',
  address: { street: 'Tahlia', buildingNumber: '4321', district: 'Rawdah', city: 'Jeddah', postalCode: '23435', countryCode: 'SA' },
};
const t = toZatcaDateTime(new Date('2026-10-14T09:30:00Z'));
const base = (o: Partial<MapInput> = {}): MapInput => ({
  kind: 'INVOICE',
  subtype: 'SIMPLIFIED',
  number: 'INV-000001',
  uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be',
  icv: 1,
  pih: 'PIH',
  issueDate: t.issueDate,
  issueTime: t.issueTime,
  seller,
  buyer: null,
  supplyDate: null,
  supplyEndDate: null,
  paymentMeansCode: '10',
  billingReferenceNumber: null,
  noteReason: null,
  docDiscountHalalas: 0,
  docDiscountReason: null,
  lines: [{ description: 'Widget', quantity: '3', unitCode: 'PCE', unitPriceHalalas: 3333, lineDiscountHalalas: 0, taxCategory: 'S', taxRateBp: 1500 }],
  ...o,
});

describe('toZatcaInput', () => {
  it('maps a simplified invoice: engine amounts, Arabic seller name, no buyer', () => {
    const z = toZatcaInput(base());
    expect(z).toMatchObject({
      kind: 'INVOICE',
      subtype: 'SIMPLIFIED',
      issueDate: '2026-10-14',
      issueTime: '09:30:00Z',
      seller: { name: 'شركة الاختبار', vatNumber: '300000000000003', idScheme: 'CRN', id: '1010010000' },
      buyer: undefined,
      billingReference: undefined,
    });
    // 3 x 33.33 = 99.99; VAT 14.9985 rounds half-up to 15.00
    expect(z.totals).toMatchObject({ lineExtensionHalalas: 9999, taxHalalas: 1500, payableHalalas: 11499 });
    expect(z.lines[0]).toMatchObject({ netHalalas: 9999, vatHalalas: 1500, totalHalalas: 11499 });
    expect(z.taxSubtotals).toEqual([{ taxCategory: 'S', taxRateBp: 1500, taxableHalalas: 9999, taxHalalas: 1500 }]);
  });

  it('maps a standard invoice with buyer and supply dates', () => {
    const z = toZatcaInput(base({ subtype: 'STANDARD', buyer, supplyDate: '2026-10-01', supplyEndDate: '2026-10-10', paymentMeansCode: '30' }));
    expect(z.buyer).toMatchObject({ name: 'Acme', vatNumber: '310000000000003', address: { city: 'Jeddah', postalCode: '23435' } });
    expect(z).toMatchObject({ supplyDate: '2026-10-01', supplyEndDate: '2026-10-10', paymentMeansCode: '30' });
  });

  it('drops a partial simplified buyer address instead of emitting an invalid one', () => {
    const z = toZatcaInput(base({ buyer: { name: 'Walk-in', address: { countryCode: 'SA' } } }));
    expect(z.buyer).toMatchObject({ name: 'Walk-in', address: undefined });
  });

  it.each([
    ['CREDIT_NOTE', 'SIMPLIFIED', '381', '0200000'],
    ['DEBIT_NOTE', 'SIMPLIFIED', '383', '0200000'],
    ['CREDIT_NOTE', 'STANDARD', '381', '0100000'],
    ['DEBIT_NOTE', 'STANDARD', '383', '0100000'],
  ] as const)('notes carry billing reference and reason (%s %s)', (kind, subtype, code, name) => {
    const standard = subtype === 'STANDARD';
    const z = toZatcaInput(
      base({
        kind,
        subtype,
        buyer: standard ? buyer : null,
        supplyDate: standard ? '2026-10-01' : null,
        billingReferenceNumber: 'INV-000001',
        noteReason: 'Returned',
        number: 'X-000001',
      }),
    );
    expect(z).toMatchObject({ kind, billingReference: 'INV-000001', reason: 'Returned' });
    const xml = buildUnsignedInvoiceXml(z);
    expect(xml).toContain(`<cbc:InvoiceTypeCode name="${name}">${code}</cbc:InvoiceTypeCode>`);
    expect(xml).toContain('<cbc:ID>INV-000001</cbc:ID>');
    expect(xml).toContain('Returned');
  });

  it('an invoice never carries a billing reference or reason', () => {
    const z = toZatcaInput(base({ billingReferenceNumber: 'INV-9', noteReason: 'x' }));
    expect(z.billingReference).toBeUndefined();
    expect(z.reason).toBeUndefined();
  });

  it('maps line and document discounts and exemption reasons', () => {
    const z = toZatcaInput(
      base({
        docDiscountHalalas: 500,
        docDiscountReason: 'Promo',
        lines: [
          { description: 'Export', quantity: '2', unitCode: 'PCE', unitPriceHalalas: 10000, lineDiscountHalalas: 1000, taxCategory: 'Z', taxRateBp: 0, exemptionReasonCode: 'VATEX-SA-32' },
        ],
      }),
    );
    expect(z.lines[0]).toMatchObject({ discountHalalas: 1000, netHalalas: 19000 });
    expect(z.docDiscount).toEqual({ amountHalalas: 500, reason: 'Promo', taxCategory: 'Z', taxRateBp: 0 });
    expect(z.taxSubtotals[0]).toMatchObject({ taxableHalalas: 18500, exemptionReasonCode: 'VATEX-SA-32' });
    expect(z.totals).toMatchObject({ allowanceTotalHalalas: 500, taxExclusiveHalalas: 18500 });
  });
});
