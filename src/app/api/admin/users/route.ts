import { NextResponse } from 'next/server';

import { adminUserCreateSchema } from '@/contracts/admin-users';
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

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const input = adminUserCreateSchema.parse(await request.json());
    const user = await usersService.createAdminUser(input);
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
