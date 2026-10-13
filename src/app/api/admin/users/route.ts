import { NextResponse } from 'next/server';

import { jsonError, requireAdminSession } from '@/server/common/http';
import { usersService } from '@/server/users/users.service';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await usersService.listAdminUsers();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
