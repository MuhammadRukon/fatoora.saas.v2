import { NextResponse } from 'next/server';

import { couponWireSchema } from '@/contracts/coupons';
import { couponsService } from '@/server/coupons/coupons.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const input = couponWireSchema.parse(await request.json());
    const coupon = await couponsService.update(id, input);
    return NextResponse.json({ coupon });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    await couponsService.remove(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
