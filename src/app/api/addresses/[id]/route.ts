import { NextResponse } from 'next/server';

import { addressInputSchema } from '@/contracts/address';
import { addressService } from '@/server/users/address.service';
import { jsonError, requireSession } from '@/server/common/http';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    const input = addressInputSchema.parse(await request.json());
    const address = await addressService.update(user.id, id, input);
    return NextResponse.json({ address });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    const user = await requireSession();
    const { id } = await ctx.params;
    await addressService.remove(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
