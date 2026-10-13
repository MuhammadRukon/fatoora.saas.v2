import { NextResponse } from 'next/server';
import { z } from 'zod';

import { cartService } from '@/server/cart/cart.service';
import { jsonError, requireSession } from '@/server/common/http';

const patchSchema = z.object({ quantity: z.number().int().min(0).max(99) });

interface Ctx {
  params: Promise<{ itemId: string }>;
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const user = await requireSession();
    const { itemId } = await ctx.params;
    const { quantity } = patchSchema.parse(await request.json());
    const cart = await cartService.updateItem(user.id, itemId, quantity);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    const user = await requireSession();
    const { itemId } = await ctx.params;
    const cart = await cartService.removeItem(user.id, itemId);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}
