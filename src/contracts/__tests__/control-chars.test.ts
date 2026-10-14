import { describe, expect, it } from 'vitest';

import { businessUpsertSchema } from '../business';
import { customerInputSchema } from '../customers';
import { documentDraftSchema } from '../documents';

const business = {
  nameEn: 'Test Co',
  nameAr: 'شركة',
  vatNumber: '300000000000003',
  sellerIdScheme: 'CRN',
  sellerIdValue: '1010010000',
  street: 'King Fahd Road',
  buildingNumber: '1234',
  district: 'Al Olaya',
  city: 'Riyadh',
  postalCode: '12345',
  businessCategory: 'Retail',
} as const;
const draft = {
  kind: 'INVOICE',
  subtype: 'SIMPLIFIED',
  lines: [{ description: 'Widget', quantity: '1', unitPriceHalalas: 100, taxCategory: 'S' }],
} as const;
const line = (description: string) => ({ ...draft, lines: [{ ...draft.lines[0], description }] });

describe('control characters in user text (finding 13)', () => {
  it.each(['a\u0000b', 'a\u0008b', 'a\u000Bb', 'a\u000Cb', 'a\u001Fb', 'a￾b', 'a￿b'])(
    'rejects %j everywhere',
    (bad) => {
      expect(businessUpsertSchema.safeParse({ ...business, nameEn: bad }).success).toBe(false);
      expect(businessUpsertSchema.safeParse({ ...business, streetAr: `ش${bad}` }).success).toBe(false);
      expect(customerInputSchema.safeParse({ name: bad }).success).toBe(false);
      expect(customerInputSchema.safeParse({ name: 'ok', street: bad }).success).toBe(false);
      expect(documentDraftSchema.safeParse(line(bad)).success).toBe(false);
      expect(documentDraftSchema.safeParse({ ...draft, notes: bad }).success).toBe(false);
      expect(
        documentDraftSchema.safeParse({ ...draft, kind: 'CREDIT_NOTE', billingReferenceId: 'x', noteReason: bad }).success,
      ).toBe(false);
    },
  );

  it('rejects CR/LF in single-line fields but keeps them in notes; tabs stay valid', () => {
    expect(businessUpsertSchema.safeParse({ ...business, city: 'Ri\nyadh' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ name: 'A\rB' }).success).toBe(false);
    expect(documentDraftSchema.safeParse(line('two\nlines')).success).toBe(false);
    expect(documentDraftSchema.safeParse({ ...draft, notes: 'two\nlines\twith tab' }).success).toBe(true);
    expect(documentDraftSchema.safeParse(line('plain Widget')).success).toBe(true);
  });
});
