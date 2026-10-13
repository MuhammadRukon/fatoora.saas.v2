import { NextResponse } from 'next/server';

import { revalidateCatalog } from '@/app/api/_lib/revalidate';
import { productInputSchema } from '@/contracts/catalog';
import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await catalogService.listProducts();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const input = productInputSchema.parse(await request.json());
    const product = await catalogService.createProduct(input);
    revalidateCatalog({ productSlug: product.slug });
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
