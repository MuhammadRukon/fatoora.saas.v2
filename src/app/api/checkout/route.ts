import { NextResponse } from 'next/server';

import { checkoutInputSchema } from '@/contracts/checkout';
import { checkoutService } from '@/server/checkout/checkout.service';
import { BadRequestError } from '@/server/common/errors';
import { jsonError, requireSession } from '@/server/common/http';
import { log } from '@/server/common/logger';
import { orderConfirmationEmail, sendMail } from '@/server/common/mailer';
import { clientIp, enforceRateLimit } from '@/server/common/rate-limit';
import { paymentsService } from '@/server/payments/payments.service';

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    await enforceRateLimit(`checkout:${user.id}:${clientIp(request)}`, {
      max: 10,
      windowMs: 60 * 1000,
    });
    const input = checkoutInputSchema.parse(await request.json());
    const { order, paymentId, feeRequired } = await checkoutService.placeOrder(user.id, input);

    const origin = new URL(request.url).origin;
    try {
      const initiated = await paymentsService.kickoff(paymentId, { origin });

      // Fire-and-forget, only once kickoff succeeded (a failed kickoff
      // cancels the order below — no confirmation for a dead order).
      void sendMail(
        user.email,
        orderConfirmationEmail({ orderNumber: order.orderNumber, totalCents: order.totalCents }),
      );
      return NextResponse.json(
        {
          id: order.id,
          orderNumber: order.orderNumber,
          totalCents: order.totalCents,
          paymentId: initiated.paymentId,
          redirectUrl: initiated.redirectUrl,
          feeRequired,
        },
        { status: 201 },
      );
    } catch (kickoffErr) {
      log.error('checkout.kickoff_failed', { orderId: order.id, error: String(kickoffErr) });
      await checkoutService.cancelOrphanedOrder(order.id);
      return jsonError(new BadRequestError('Could not start payment; please try again'));
    }
  } catch (err) {
    return jsonError(err);
  }
}
