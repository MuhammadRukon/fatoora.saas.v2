import { NextResponse } from 'next/server';
import { PaymentMethod } from '@prisma/client';

import { paymentSettingsInputSchema } from '@/contracts/payment-settings';
import { jsonError, requireAdminSession } from '@/server/common/http';
import { gatewayConfigured } from '@/server/payments/gateway-creds';
import { paymentSettingsService } from '@/server/settings/payment-settings.service';

// Settings change at runtime; never serve a cached copy.
export const dynamic = 'force-dynamic';

/** Booleans only: which methods are usable. Never exposes env values. */
function gatewayStatus(): Record<PaymentMethod, boolean> {
  return Object.fromEntries(
    Object.values(PaymentMethod).map((method) => [method, gatewayConfigured(method)]),
  ) as Record<PaymentMethod, boolean>;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    await requireAdminSession();
    const settings = await paymentSettingsService.get();
    return NextResponse.json(
      { settings, gatewayConfigured: gatewayStatus() },
      { headers: NO_STORE },
    );
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const admin = await requireAdminSession();
    const input = paymentSettingsInputSchema.parse(await request.json());
    const settings = await paymentSettingsService.update(admin.id, input);
    return NextResponse.json(
      { settings, gatewayConfigured: gatewayStatus() },
      { headers: NO_STORE },
    );
  } catch (err) {
    return jsonError(err);
  }
}
