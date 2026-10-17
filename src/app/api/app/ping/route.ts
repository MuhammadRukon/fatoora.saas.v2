import { NextResponse } from 'next/server';

import { jsonError, requireAppSession } from '@/server/common/http';

// Fixture for the /api/app subscription gate (402 without ACTIVE); see plan AC2.9.
export async function GET() {
  try {
    await requireAppSession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
