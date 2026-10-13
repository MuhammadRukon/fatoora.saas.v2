import { NextResponse } from 'next/server';

import { couponWireSchema } from '@/contracts/coupons';
import { couponsService } from '@/server/coupons/coupons.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await couponsService.list();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const input = couponWireSchema.parse(await request.json());
    const coupon = await couponsService.create(input);
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
