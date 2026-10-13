import { NextResponse } from 'next/server';

import { customerInputSchema, customerListQuerySchema } from '@/contracts/customers';
import { customersService } from '@/server/customers/customers.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

export async function GET(request: Request) {
  try {
    const { businessId } = await requireBusinessContext();
    const query = customerListQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return NextResponse.json(await customersService.list(businessId, query));
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { businessId } = await requireBusinessContext();
    const data = customerInputSchema.parse(await request.json());
    return NextResponse.json(await customersService.create(businessId, data), { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
