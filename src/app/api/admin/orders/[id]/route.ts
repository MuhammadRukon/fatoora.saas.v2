import { NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

import { ordersService } from '@/server/orders/orders.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const transitionSchema = z.object({
  status: z.enum(OrderStatus),
  note: z.string().max(300).optional(),
});

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const order = await ordersService.getAdmin(id);
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    const { status, note } = transitionSchema.parse(await request.json());
    const order = await ordersService.transition(admin.id, id, status, note);
    return NextResponse.json({ order });
  } catch (err) {
    return jsonError(err);
  }
}
