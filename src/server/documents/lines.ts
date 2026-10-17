import type { DocumentLine } from '@prisma/client';

/** A stored line as the writable/engine shape (quantity as the exact decimal string). */
export const lineToInput = (l: DocumentLine) => ({
  description: l.description,
  descriptionAr: l.descriptionAr,
  unitCode: l.unitCode,
  quantity: l.quantity.toString(),
  unitPriceHalalas: l.unitPriceHalalas,
  lineDiscountHalalas: l.lineDiscountHalalas,
  taxCategory: l.taxCategory,
  taxRateBp: l.taxRateBp,
  exemptionReasonCode: l.exemptionReasonCode,
  exemptionReason: l.exemptionReason,
});
