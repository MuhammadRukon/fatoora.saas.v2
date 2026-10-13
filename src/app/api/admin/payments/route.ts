import { NextResponse } from 'next/server';

import { paymentsService } from '@/server/payments/payments.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await paymentsService.listPendingForVerification();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
