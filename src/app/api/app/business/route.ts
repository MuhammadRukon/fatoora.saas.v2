import { NextResponse } from 'next/server';

import { businessUpsertSchema } from '@/contracts/business';
import { businessService } from '@/server/business/business.service';
import { jsonError, requireAppSession } from '@/server/common/http';

/** The user's business profile, or null before setup (no BUSINESS_REQUIRED here: this is the setup page). */
export async function GET() {
  try {
    const { userId } = await requireAppSession();
    return NextResponse.json(await businessService.getMine(userId));
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireAppSession();
    const data = businessUpsertSchema.parse(await request.json());
    return NextResponse.json(await businessService.upsertMine(userId, data));
  } catch (err) {
    return jsonError(err);
  }
}
