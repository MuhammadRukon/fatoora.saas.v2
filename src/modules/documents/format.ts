import type { DocumentDTO } from '@/contracts/documents';
import { fromHalalas } from '@/server/common/money';

const group = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1,234.56": Latin digits and exactly 2 decimals, for lists, forms and the print view. */
export const formatAmount = (halalas: number) => group.format(Number(fromHalalas(halalas)));

/**
 * Printing rules: simplified documents once issued, standard ones only after ZATCA cleared them (the buyer must not
 * receive an uncleared standard invoice). Drafts stay printable as a watermarked preview.
 */
export function printState(doc: Pick<DocumentDTO, 'status' | 'subtype' | 'submissionStatus'>): { allowed: boolean; reason?: string } {
  if (doc.status === 'DRAFT' || doc.subtype === 'SIMPLIFIED' || doc.submissionStatus === 'CLEARED') return { allowed: true };
  return { allowed: false, reason: doc.submissionStatus === 'REJECTED' ? 'Rejected by ZATCA' : 'Awaiting ZATCA clearance' };
}
