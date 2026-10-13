import { NextResponse } from 'next/server';

import { checkoutQuoteSchema } from '@/contracts/checkout';
import { checkoutService } from '@/server/checkout/checkout.service';
import { jsonError, requireSession } from '@/server/common/http';
import { enforceRateLimit } from '@/server/common/rate-limit';

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    await enforceRateLimit(`quote:${user.id}`, { max: 30, windowMs: 60_000 });
    const input = checkoutQuoteSchema.parse(await request.json());
    const quote = await checkoutService.quote({ userId: user.id, ...input });
    return NextResponse.json(quote);
  } catch (err) {
    return jsonError(err);
  }
}
