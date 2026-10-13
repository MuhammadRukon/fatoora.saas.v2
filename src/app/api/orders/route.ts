import { NextResponse } from 'next/server';

import { ordersService } from '@/server/orders/orders.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function GET() {
  try {
    const user = await requireSession();
    const items = await ordersService.listByUser(user.id);
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
