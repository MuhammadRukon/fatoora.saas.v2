import { NextResponse } from 'next/server';
import { z } from 'zod';

import { cartItemInputSchema, guestCartLineSchema } from '@/contracts/cart';
import { cartService } from '@/server/cart/cart.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function GET(request: Request) {
  try {
    const user = await requireSession();
    const url = new URL(request.url);
    const view = url.searchParams.get('view');
    if (view === 'summary') {
      const summary = await cartService.getCartSummary(user.id);
      return NextResponse.json(summary);
    }
    const cart = await cartService.getCart(user.id);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    const input = cartItemInputSchema.parse(await request.json());
    const cart = await cartService.addItem(user.id, input);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}

const mergeSchema = z.object({ lines: z.array(guestCartLineSchema) });

export async function PUT(request: Request) {
  try {
    const user = await requireSession();
    const { lines } = mergeSchema.parse(await request.json());
    const cart = await cartService.mergeGuestCart(user.id, lines);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE() {
  try {
    const user = await requireSession();
    await cartService.clear(user.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
