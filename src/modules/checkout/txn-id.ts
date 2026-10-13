import { TXN_ID_MAX, TXN_ID_MIN, txnIdSchema } from '@/contracts/payments';
import { adminClause } from '@/lib/cod-fee/copy';

export type TxnIdInput =
  | { status: 'empty' }
  | { status: 'valid'; value: string }
  | { status: 'invalid' };

/**
 * Classifies raw customer input with the same schema the server enforces
 * (trim, 6-30 alphanumeric, uppercased), so the client only calls
 * `/api/payments/txn-check` for ids the server would accept.
 */
export function parseTxnIdInput(raw: string): TxnIdInput {
  if (raw.trim() === '') return { status: 'empty' };
  const parsed = txnIdSchema.safeParse(raw);
  return parsed.success ? { status: 'valid', value: parsed.data } : { status: 'invalid' };
}

export const TXN_ID_FORMAT_HINT = `Use ${TXN_ID_MIN} to ${TXN_ID_MAX} letters and numbers, no spaces or symbols.`;

export const TXN_CHECK_UNAVAILABLE_MESSAGE =
  'Could not check this transaction ID right now. You can still place your order.';

/** Body of the confirm dialog shown before the add-only txn id is submitted. */
export function buildTxnConfirmText(contactNumber: string | null): string {
  return `Are you sure the transaction ID is correct? It cannot be edited after submission. If it is wrong, ${adminClause(contactNumber)}. Your order and confirmation fee are safe.`;
}

/** Order-page copy for a duplicate id. Deliberately reveals nothing about the other order. */
export function buildTxnDuplicateOnOrderMessage(contactNumber: string | null): string {
  const clause = adminClause(contactNumber);
  return `Transaction ID already exists. Please ${clause}.`;
}
