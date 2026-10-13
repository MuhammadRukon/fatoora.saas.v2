import { NextResponse } from 'next/server';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { log } from '@/server/common/logger';
import { paymentsService } from '@/server/payments/payments.service';
import { bkashGateway } from '@/server/payments/providers/bkash';
import { sslcommerzGateway } from '@/server/payments/providers/sslcommerz';

/**
 * Shared payment-callback transport. Each provider has its own thin
 * route file that delegates here, so the actual logic lives in one
 * place and can be unit-tested.
 */

async function readPayload(request: Request): Promise<Record<string, string>> {
  const url = new URL(request.url);
  const fromQuery = Object.fromEntries(url.searchParams.entries());

  if (request.method !== 'POST') return fromQuery;

  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      const json = (await request.json()) as Record<string, string>;
      return { ...fromQuery, ...json };
    } catch {
      return fromQuery;
    }
  }
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const form = await request.formData();
    const body = Object.fromEntries(
      Array.from(form.entries()).filter(([, v]) => typeof v === 'string') as [string, string][],
    );
    return { ...fromQuery, ...body };
  }
  return fromQuery;
}

async function redirectToOrder(request: Request, paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { orderId: true, status: true },
  });
  if (!payment) {
    return NextResponse.redirect(new URL('/cart?paymentError=1', request.url), 303);
  }
  const target =
    payment.status === PaymentStatus.SUCCEEDED
      ? `/orders/${payment.orderId}?paid=1`
      : payment.status === PaymentStatus.CANCELLED
        ? `/orders/${payment.orderId}?cancelled=1`
        : `/orders/${payment.orderId}?paymentFailed=1`;
  return NextResponse.redirect(new URL(target, request.url), 303);
}

export async function handleSslcommerzReturn(request: Request) {
  const payload = await readPayload(request);
  const paymentId = payload.tran_id || payload.paymentId;
  if (!paymentId) {
    return NextResponse.redirect(new URL('/cart?paymentError=1', request.url), 303);
  }

  // Set a sane default status on cancel/fail callbacks where the
  // gateway didn't include the val_id. This way the gateway parser
  // can normalise consistently.
  const path = new URL(request.url).pathname;
  if (path.endsWith('/fail') && !payload.status) payload.status = 'FAILED';
  if (path.endsWith('/cancel') && !payload.status) payload.status = 'CANCELLED';
  payload.tran_id = paymentId;

  try {
    const outcome = await sslcommerzGateway.parseCallback(payload);
    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, outcome);
  } catch (err) {
    log.error('payments.sslcommerz.return', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return redirectToOrder(request, paymentId);
}

export async function handleSslcommerzIpn(request: Request) {
  const payload = await readPayload(request);
  const paymentId = payload.tran_id;
  if (!paymentId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const outcome = await sslcommerzGateway.parseCallback(payload);
    await paymentsService.applyCallback(PaymentMethod.SSLCOMMERZ, outcome);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error('payments.sslcommerz.ipn', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function handleBkashCallback(request: Request) {
  const payload = await readPayload(request);
  const paymentId = payload.paymentId || payload.paymentDbId;
  if (!paymentId || !payload.paymentID) {
    return NextResponse.redirect(new URL('/cart?paymentError=1', request.url), 303);
  }
  try {
    const outcome = await bkashGateway.parseCallback({
      paymentDbId: paymentId,
      paymentID: payload.paymentID,
      status: payload.status,
    });
    await paymentsService.applyCallback(PaymentMethod.BKASH, outcome);
  } catch (err) {
    log.error('payments.bkash.callback', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return redirectToOrder(request, paymentId);
}
