import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ordersService } from '@/server/orders/orders.service';
import { jsonError, requireSession } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const order = await ordersService.getOwned(user.id, id);
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}

const cancelSchema = z.object({ reason: z.string().min(2).max(200) });

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireSession();
    const { id } = await params;
    const url = new URL(request.url);
    if (url.searchParams.get('action') !== 'cancel') {
      return NextResponse.json({ code: 'BAD_REQUEST', message: 'Unknown action' }, { status: 400 });
    }
    const { reason } = cancelSchema.parse(await request.json());
    const order = await ordersService.cancelByCustomer(user.id, id, reason);
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}
