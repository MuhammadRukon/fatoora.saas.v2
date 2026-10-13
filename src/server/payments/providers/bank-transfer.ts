import { PaymentMethod } from '@prisma/client';

import type { PaymentGateway } from '../gateway.interface';

/**
 * Manual bank transfer provider. The customer is redirected to a
 * local instructions page where they record the bank reference; the
 * admin verifies it offline and flips the payment status. As with
 * COD, no remote gateway is involved.
 */
export const bankTransferGateway: PaymentGateway = {
  method: PaymentMethod.BANK_TRANSFER,
  async init({ orderId }) {
    return { redirectUrl: `/orders/${orderId}/bank-transfer` };
  },
  async parseCallback() {
    throw new Error('Bank transfer does not use callbacks');
  },
};
