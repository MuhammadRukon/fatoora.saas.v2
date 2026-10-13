import { NextResponse } from 'next/server';

import { analyticsService } from '@/server/analytics/analytics.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const overview = await analyticsService.overview();
    return NextResponse.json(overview);
  } catch (err) {
    return jsonError(err);
  }
}
