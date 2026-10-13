// ZATCA code lists. Sources: XML Implementation Standard v1.2 (sec. 11 code lists, BR-KSA-08/14/81),
// confirmed against plan Appendix B. KSA-2 is 7 chars per ZATCA staff (forum t/7826).

export type ZatcaKind = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type ZatcaSubtype = 'STANDARD' | 'SIMPLIFIED';
export type TaxCategoryCode = 'S' | 'Z' | 'E' | 'O';

// BT-3, UN/CEFACT 1001
export const INVOICE_TYPE_CODE: Record<ZatcaKind, string> = {
  INVOICE: '388',
  CREDIT_NOTE: '381',
  DEBIT_NOTE: '383',
};

// KSA-2 (NNPNESB): 01 = tax invoice, 02 = simplified; other positions 0
export const INVOICE_SUBTYPE_NAME: Record<ZatcaSubtype, string> = {
  STANDARD: '0100000',
  SIMPLIFIED: '0200000',
};

// Exemption reason codes (BT-121) with the official English text (BT-120), XML standard v1.2 p.32-33.
export const VATEX_REASONS: Record<string, { category: TaxCategoryCode; text: string }> = {
  'VATEX-SA-29': { category: 'E', text: 'Financial services mentioned in Article 29 of the VAT Regulations' },
  'VATEX-SA-29-7': { category: 'E', text: 'Life insurance services mentioned in Article 29 of the VAT Regulations' },
  'VATEX-SA-30': { category: 'E', text: 'Real estate transactions mentioned in Article 30 of the VAT Regulations' },
  'VATEX-SA-32': { category: 'Z', text: 'Export of goods' },
  'VATEX-SA-33': { category: 'Z', text: 'Export of services' },
  'VATEX-SA-34-1': { category: 'Z', text: 'The international transport of Goods' },
  'VATEX-SA-34-2': { category: 'Z', text: 'international transport of passengers' },
  'VATEX-SA-34-3': {
    category: 'Z',
    text: 'services directly connected and incidental to a Supply of international passenger transport',
  },
  'VATEX-SA-34-4': { category: 'Z', text: 'Supply of a qualifying means of transport' },
  'VATEX-SA-34-5': {
    category: 'Z',
    text: 'Any services relating to Goods or passenger transportation, as defined in article twenty five of these Regulations',
  },
  'VATEX-SA-35': { category: 'Z', text: 'Medicines and medical equipment' },
  'VATEX-SA-36': { category: 'Z', text: 'Qualifying metals' },
  'VATEX-SA-EDU': { category: 'Z', text: 'Private education to citizen' },
  'VATEX-SA-HEA': { category: 'Z', text: 'Private healthcare to citizen' },
  'VATEX-SA-MLTRY': { category: 'Z', text: 'supply of qualified military goods' },
  // Reason text is free text supplied by the taxpayer.
  'VATEX-SA-OOS': { category: 'O', text: '' },
};

// UNTDID 4461 subset used by the app
export const PAYMENT_MEANS = { INSTRUMENT_NOT_DEFINED: '1', CASH: '10', CREDIT: '30', BANK_ACCOUNT: '42', BANK_CARD: '48' } as const;

// BT-29-1 (seller) and BT-46-1 (buyer) scheme ids, BR-KSA-08 / BR-KSA-14
export const SELLER_ID_SCHEMES = ['CRN', 'MOM', 'MLS', '700', 'SAG', 'OTH'] as const;
export const BUYER_ID_SCHEMES = ['TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH'] as const;
export type SellerIdScheme = (typeof SELLER_ID_SCHEMES)[number];
export type BuyerIdScheme = (typeof BUYER_ID_SCHEMES)[number];
