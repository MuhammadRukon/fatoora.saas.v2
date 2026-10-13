'use client';

import { useState } from 'react';

import { parseTxnIdInput } from '@/modules/checkout/txn-id';

/**
 * Checkout-side state of the optional COD confirmation-fee transaction id.
 * `feeActive` is whether the fee UI is currently showing for a settled quote.
 *
 * - `fieldProps` spreads onto `TxnIdField`.
 * - `blocksOrder`: a non-empty id the server would reject (422) blocks the
 *   order until fixed or cleared.
 * - `valueToSend`: only a valid id that the blur check did not flag as
 *   existing is sent with the order.
 * - `markServerDuplicate`: the server answered TXN_ID_DUPLICATE; the cart is
 *   untouched, so clear the id and show the inline message for a retry.
 */
export function useCheckoutTxnId(feeActive: boolean) {
  const [txnId, setTxnId] = useState('');
  const [txnDuplicate, setTxnDuplicate] = useState(false);

  const txnInput = parseTxnIdInput(txnId);
  const blocksOrder = feeActive && txnInput.status === 'invalid';
  const valueToSend =
    feeActive && !txnDuplicate && txnInput.status === 'valid' ? txnInput.value : undefined;

  function markServerDuplicate() {
    setTxnId('');
    setTxnDuplicate(true);
  }

  return {
    fieldProps: {
      value: txnId,
      onChange: setTxnId,
      duplicate: txnDuplicate,
      onDuplicateChange: setTxnDuplicate,
    },
    blocksOrder,
    valueToSend,
    markServerDuplicate,
  };
}
