import { NextResponse } from 'next/server';

import { adminUserUpdateSchema } from '@/contracts/admin-users';
import { jsonError, requireAdminSession } from '@/server/common/http';
import { usersService } from '@/server/users/users.service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    await requireAdminSession();
    const { id } = await params;
    const input = adminUserUpdateSchema.parse(await request.json());
    const user = await usersService.updateAdminUser(id, input);
    return NextResponse.json({ user });
  } catch (err) {
    return jsonError(err);
  }
}
