import { NextResponse } from 'next/server';

import { ordersService } from '@/server/orders/orders.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await ordersService.listAll();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
