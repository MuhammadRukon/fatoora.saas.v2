import { NextResponse } from 'next/server';

import { submitWarrantySchema } from '@/contracts/warranty';
import { warrantyService } from '@/server/warranty/warranty.service';
import { jsonError, requireSession } from '@/server/common/http';
import { enforceRateLimit } from '@/server/common/rate-limit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireSession();
    await enforceRateLimit(`warranty:${user.id}`, { max: 5, windowMs: 3_600_000 });
    const { id } = await params;
    const { reason } = submitWarrantySchema.parse(await request.json());
    const warranty = await warrantyService.submit(user.id, id, reason);
    return NextResponse.json({ warranty }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
