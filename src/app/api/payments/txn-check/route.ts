import { NextResponse } from 'next/server';

import { txnCheckSchema, type TxnCheckResult } from '@/contracts/payments';
import { jsonError, requireSession } from '@/server/common/http';
import { enforceUserRateLimits } from '@/server/common/rate-limit';
import { codFeeService } from '@/server/payments/cod-fee.service';

/**
 * Tells a customer whether a transaction id is already in use. Boolean-only
 * by design (no order id/number): auth + rate limit make it a poor
 * enumeration oracle.
 */
export async function POST(request: Request) {
  try {
    const user = await requireSession();
    // Per-user cap as well as user+IP: the IP bucket alone is evaded by rotating IPs.
    await enforceUserRateLimits('txn-check', user.id, request);
    const { txnId } = txnCheckSchema.parse(await request.json());
    const body: TxnCheckResult = { exists: await codFeeService.txnIdExists(txnId) };
    return NextResponse.json(body);
  } catch (err) {
    return jsonError(err);
  }
}
