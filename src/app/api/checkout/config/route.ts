import { NextResponse } from 'next/server';

import { jsonError, requireSession } from '@/server/common/http';
import { paymentSettingsService } from '@/server/settings/payment-settings.service';

// Settings change at any time and drive what the customer may pick, so this
// must never be cached (no `revalidate`, unlike the catalog routes).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireSession();
    const config = await paymentSettingsService.getPublicConfig();
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return jsonError(err);
  }
}
