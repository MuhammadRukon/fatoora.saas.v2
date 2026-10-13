import { NextResponse } from 'next/server';

import { jsonError, requireAdminSession } from '@/server/common/http';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    return NextResponse.json(await subscriptionsService.activate(id, admin.id));
  } catch (err) {
    return jsonError(err);
  }
}
