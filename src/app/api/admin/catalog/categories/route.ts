import { NextResponse } from 'next/server';

import { revalidateCatalog } from '@/app/api/_lib/revalidate';
import { categoryInputSchema } from '@/contracts/catalog';
import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

export async function GET() {
  try {
    await requireAdminSession();
    const items = await catalogService.listCategories();
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const input = categoryInputSchema.parse(await request.json());
    const category = await catalogService.createCategory(input);
    revalidateCatalog({ menu: true });
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
