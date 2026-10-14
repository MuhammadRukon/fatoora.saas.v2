import type { DocumentKind, Prisma } from '@prisma/client';

const PREFIX: Record<DocumentKind, string> = { INVOICE: 'INV', CREDIT_NOTE: 'CN', DEBIT_NOTE: 'DN' };

/** INV-000001. Zero-padded to 6, so numbers sort by sequence up to 999999. */
export const formatDocumentNumber = (kind: DocumentKind, sequence: number) =>
  `${PREFIX[kind]}-${String(sequence).padStart(6, '0')}`;

/**
 * Next gap-free number for (business, kind). Takes a row lock on the Business, so concurrent
 * issues of the same business queue up behind each other; the caller must write the document
 * (with this sequence) in the same transaction before it commits. Called only from issue (Phase 7).
 */
export async function allocateNumber(tx: Prisma.TransactionClient, businessId: string, kind: DocumentKind) {
  await tx.$queryRaw`SELECT 1 FROM "Business" WHERE "id" = ${businessId} FOR UPDATE`;
  const { _max } = await tx.document.aggregate({ where: { businessId, kind }, _max: { sequence: true } });
  const sequence = (_max.sequence ?? 0) + 1;
  return { sequence, number: formatDocumentNumber(kind, sequence) };
}
