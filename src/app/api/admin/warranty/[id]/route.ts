import { NextResponse } from 'next/server';

import { transitionWarrantySchema } from '@/contracts/warranty';
import { warrantyService } from '@/server/warranty/warranty.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdminSession();
    const { id } = await params;
    const { status, resolution } = transitionWarrantySchema.parse(await request.json());
    const warranty = await warrantyService.transition(admin.id, id, status, resolution);
    return NextResponse.json({ warranty });
  } catch (err) {
    return jsonError(err);
  }
}
