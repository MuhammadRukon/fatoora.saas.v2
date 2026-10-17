import { NextResponse } from 'next/server';

import { jsonError, requireBusinessContext } from '@/server/common/http';
import { onboardingService } from '@/server/zatca-onboarding/onboarding.service';

export async function GET() {
  try {
    const { businessId } = await requireBusinessContext();
    return NextResponse.json(await onboardingService.getStatus(businessId));
  } catch (err) {
    return jsonError(err);
  }
}
