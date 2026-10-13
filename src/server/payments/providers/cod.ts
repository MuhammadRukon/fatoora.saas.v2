import { CodFeeStatus, OrderStatus, PaymentMethod } from '@prisma/client';

import { resolveCodFee } from '@/lib/cod-fee/compute';
import { normalizeTxnId } from '@/contracts/payments';

import type { PaymentGateway } from '../gateway.interface';
import { defaultPlacementPlan, ORDER_PLACED_EVENT } from '../placement';

/**
 * Cash on Delivery provider. There is no gateway hop: the actual payment
 * is collected when the courier hands over the parcel; admin marks the
 * order as paid via `/api/admin/payments/[id]/verify`.
 * When a COD confirmation fee applies, the order stays PENDING until the
 * admin verifies the fee via `/api/admin/payments/[id]/fee`; cash verify
 * is blocked until then.
 *
 * We still implement the strategy interface so the rest of the system
 * can treat every method uniformly.
 */
export const codGateway: PaymentGateway = {
  method: PaymentMethod.COD,
  async init() {
    // `paymentsService.kickoff` returns before reaching a gateway for COD.
    throw new Error('COD has no gateway hop');
  },
  async parseCallback() {
    throw new Error('COD does not use callbacks');
  },
  planPlacement({ settings, totalCents, customerTxnId }) {
    const fee = resolveCodFee({ settings, totalCents });

    if (!fee) {
      // No fee: auto-confirm so the admin sees the order in CONFIRMED state.
      return {
        ...defaultPlacementPlan(),
        initialStatus: OrderStatus.CONFIRMED,
        events: [
          ORDER_PLACED_EVENT,
          {
            status: OrderStatus.CONFIRMED,
            note: 'COD order auto-confirmed; awaiting fulfilment',
          },
        ],
      };
    }

    // The txn id only means something when a fee is being paid.
    const txnId = customerTxnId ? normalizeTxnId(customerTxnId) : null;
    return {
      paymentFields: {
        feeCents: fee.feeCents,
        feeType: fee.rule.type,
        feeValue: fee.rule.value,
        feeStatus: CodFeeStatus.PENDING,
        ...(txnId ? { customerTxnId: txnId, txnSubmittedAt: new Date() } : {}),
      },
      // Stays PENDING until an admin verifies the fee (codFeeService.verifyFee).
      initialStatus: OrderStatus.PENDING,
      events: [
        ORDER_PLACED_EVENT,
        { status: OrderStatus.PENDING, note: 'COD confirmation fee pending' },
      ],
      feeRequired: true,
      fee,
    };
  },
};
