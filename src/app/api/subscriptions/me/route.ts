import { NextResponse } from 'next/server';

import { jsonError, requireUserSession } from '@/server/common/http';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

export async function GET() {
  try {
    const user = await requireUserSession();
    return NextResponse.json(await subscriptionsService.getState(user.id));
  } catch (err) {
    return jsonError(err);
  }
}
