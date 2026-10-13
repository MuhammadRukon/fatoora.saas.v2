import { NextResponse } from 'next/server';
import { hydrateBodySchema } from '@/contracts/cart';
import { cartService } from '@/server/cart/cart.service';
import { jsonError } from '@/server/common/http';
import { enforceIpLimit } from '@/server/common/rate-limit';

export async function POST(request: Request) {
  try {
    await enforceIpLimit(request, 'hydrate');
    const { lines } = hydrateBodySchema.parse(await request.json());
    const cart = await cartService.hydrateGuestCart(lines);
    return NextResponse.json(cart);
  } catch (err) {
    return jsonError(err);
  }
}
