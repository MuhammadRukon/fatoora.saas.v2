import type { Business, Customer } from '@prisma/client';

import type { PartySnapshot } from '@/contracts/documents';

/** Prisma's S700 enum member is the ZATCA scheme "700". */
const scheme = (s: string | null) => (s === 'S700' ? '700' : s);

/** Live seller view; Phase 7 stores the same shape in Document.sellerSnapshot at issue. */
export const sellerParty = (b: Business): PartySnapshot => ({
  name: b.nameEn,
  nameAr: b.nameAr,
  vatNumber: b.vatNumber,
  idScheme: scheme(b.sellerIdScheme),
  idValue: b.sellerIdValue,
  address: {
    street: b.street,
    streetAr: b.streetAr,
    buildingNumber: b.buildingNumber,
    additionalNumber: b.additionalNumber,
    district: b.district,
    districtAr: b.districtAr,
    city: b.city,
    cityAr: b.cityAr,
    postalCode: b.postalCode,
    countryCode: b.countryCode,
  },
});

/** Live buyer view; Phase 7 stores the same shape in Document.buyerSnapshot at issue. */
export const buyerParty = (c: Customer): PartySnapshot => ({
  name: c.name,
  nameAr: c.nameAr,
  vatNumber: c.vatNumber,
  idScheme: scheme(c.buyerIdScheme),
  idValue: c.buyerIdValue,
  address: {
    street: c.street,
    buildingNumber: c.buildingNumber,
    additionalNumber: c.additionalNumber,
    district: c.district,
    city: c.city,
    postalCode: c.postalCode,
    countryCode: c.countryCode,
  },
});
