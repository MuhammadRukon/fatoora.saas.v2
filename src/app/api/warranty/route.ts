import { NextResponse } from 'next/server';

import { warrantyService } from '@/server/warranty/warranty.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function GET() {
  try {
    const user = await requireSession();
    const items = await warrantyService.listMy(user.id);
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
