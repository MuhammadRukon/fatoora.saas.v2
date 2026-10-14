import { NextResponse } from 'next/server';

import { onboardSchema } from '@/contracts/zatca';
import { jsonError, requireBusinessContext } from '@/server/common/http';
import { enforceRateLimit } from '@/server/common/rate-limit';
import { onboardingService } from '@/server/zatca-onboarding/onboarding.service';

// Each attempt spends a real ZATCA OTP, so cap them per business.
const ONBOARD_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  try {
    const { businessId } = await requireBusinessContext();
    const { otp } = onboardSchema.parse(await request.json());
    await enforceRateLimit(`zatca-onboard:${businessId}`, ONBOARD_LIMIT);
    const { status, errors, results } = await onboardingService.onboard(businessId, otp);
    // Explicit pick: the service result never leaves the server as-is.
    return NextResponse.json({
      status,
      errors,
      results: results.map(({ label, httpStatus, outcome, errors, warnings, messages }) => ({
        label,
        httpStatus,
        outcome,
        errors,
        warnings,
        messages,
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}
