import type { ZatcaDocumentInput } from '../xml/ubl-builder';

const seller: ZatcaDocumentInput['seller'] = {
  name: 'شركة الاختبار | Test Co',
  vatNumber: '399999999900003',
  idScheme: 'CRN',
  id: '1010010000',
  address: {
    street: 'King Fahd Rd',
    buildingNumber: '1234',
    additionalNumber: '5678',
    district: 'Al Olaya',
    city: 'Riyadh',
    postalCode: '12345',
    countryCode: 'SA',
  },
};

const buyer: ZatcaDocumentInput['buyer'] = {
  name: 'Buyer & Sons',
  vatNumber: '300000000000003',
  address: {
    street: 'Tahlia St',
    buildingNumber: '4321',
    district: 'Al Rawdah',
    city: 'Jeddah',
    postalCode: '23435',
    countryCode: 'SA',
  },
};

// 2 x 100.00 S/15% + 1 x 50.00 Z (export), no discounts.
const base: ZatcaDocumentInput = {
  kind: 'INVOICE',
  subtype: 'SIMPLIFIED',
  number: 'INV-000001',
  uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be',
  icv: 1,
  pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
  issueDate: '2026-10-14',
  issueTime: '09:30:00Z',
  seller,
  paymentMeansCode: '10',
  lines: [
    { name: 'قلم | Pen', quantity: '2', unitCode: 'PCE', unitPriceHalalas: 10000, netHalalas: 20000, vatHalalas: 3000, totalHalalas: 23000, taxCategory: 'S', taxRateBp: 1500 },
    { name: 'Export item', quantity: '1', unitCode: 'PCE', unitPriceHalalas: 5000, netHalalas: 5000, vatHalalas: 0, totalHalalas: 5000, taxCategory: 'Z', taxRateBp: 0 },
  ],
  taxSubtotals: [
    { taxCategory: 'S', taxRateBp: 1500, taxableHalalas: 20000, taxHalalas: 3000 },
    { taxCategory: 'Z', taxRateBp: 0, taxableHalalas: 5000, taxHalalas: 0, exemptionReasonCode: 'VATEX-SA-32', exemptionReason: 'Export of goods' },
  ],
  totals: {
    lineExtensionHalalas: 25000,
    allowanceTotalHalalas: 0,
    taxExclusiveHalalas: 25000,
    taxHalalas: 3000,
    taxInclusiveHalalas: 28000,
    payableHalalas: 28000,
  },
};

export const simplifiedInvoice: ZatcaDocumentInput = base;

export const standardInvoice: ZatcaDocumentInput = {
  ...base,
  subtype: 'STANDARD',
  number: 'INV-000002',
  uuid: '8d487816-70b8-4ade-a618-9d620b73814a',
  icv: 2,
  buyer,
  supplyDate: '2026-10-14',
  paymentMeansCode: '30',
};

export const simplifiedCreditNote: ZatcaDocumentInput = {
  ...base,
  kind: 'CREDIT_NOTE',
  number: 'CN-000001',
  uuid: '5a4c1d2e-0f3b-4c6d-9e8f-7a6b5c4d3e2f',
  icv: 3,
  billingReference: 'INV-000001',
  reason: 'Returned goods',
  lines: [base.lines[0]],
  taxSubtotals: [base.taxSubtotals[0]],
  totals: { ...base.totals, lineExtensionHalalas: 20000, taxExclusiveHalalas: 20000, taxInclusiveHalalas: 23000, payableHalalas: 23000 },
};

export const standardCreditNote: ZatcaDocumentInput = {
  ...standardInvoice,
  kind: 'CREDIT_NOTE',
  number: 'CN-000002',
  uuid: '0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9',
  icv: 4,
  billingReference: 'INV-000002',
  reason: 'Price correction',
};
