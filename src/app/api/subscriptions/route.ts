import { NextResponse } from 'next/server';

import { subscriptionCreateSchema } from '@/contracts/subscriptions';
import { jsonError, requireUserSession } from '@/server/common/http';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

export async function POST(request: Request) {
  try {
    const user = await requireUserSession();
    const { plan } = subscriptionCreateSchema.parse(await request.json());
    const subscription = await subscriptionsService.requestPlan(user.id, plan);
    return NextResponse.json(subscription, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
