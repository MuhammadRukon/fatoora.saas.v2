import { NextResponse } from 'next/server';

import { submitBankReferenceSchema } from '@/contracts/payments';
import { paymentsService } from '@/server/payments/payments.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    const { paymentId, bankRef } = submitBankReferenceSchema.parse(await request.json());
    const payment = await paymentsService.submitBankReference(user.id, paymentId, bankRef);
    return NextResponse.json({ payment });
  } catch (err) {
    return jsonError(err);
  }
}
