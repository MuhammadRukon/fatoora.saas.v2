import { NextResponse } from 'next/server';

import { addressInputSchema } from '@/contracts/address';
import { addressService } from '@/server/users/address.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function GET() {
  try {
    const user = await requireSession();
    const addresses = await addressService.list(user.id);
    return NextResponse.json({ items: addresses });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSession();
    const input = addressInputSchema.parse(await request.json());
    const address = await addressService.create(user.id, input);
    return NextResponse.json({ address }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
