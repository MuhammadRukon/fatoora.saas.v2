import { NextResponse } from 'next/server';

import { verifyPaymentSchema } from '@/contracts/payments';
import { paymentsService } from '@/server/payments/payments.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    const { outcome, note } = verifyPaymentSchema.parse(await request.json());
    const payment = await paymentsService.verify(admin.id, id, outcome, note);
    return NextResponse.json({ payment });
  } catch (err) {
    return jsonError(err);
  }
}
