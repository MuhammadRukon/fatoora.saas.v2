import { NextResponse } from 'next/server';

import { adminSetTxnIdSchema } from '@/contracts/payments';
import { jsonError, requireAdminSession } from '@/server/common/http';
import { codFeeService } from '@/server/payments/cod-fee.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    const { txnId } = adminSetTxnIdSchema.parse(await request.json());
    const payment = await codFeeService.adminSetTxnId(admin.id, id, txnId);
    return NextResponse.json({ payment });
  } catch (err) {
    return jsonError(err);
  }
}
