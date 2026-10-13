import { NextResponse } from 'next/server';

import { revalidateCatalog } from '@/app/api/_lib/revalidate';
import { categoryInputSchema } from '@/contracts/catalog';
import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    await requireAdminSession();
    const { id } = await ctx.params;
    const input = categoryInputSchema.parse(await request.json());
    const category = await catalogService.updateCategory(id, input);
    revalidateCatalog({ menu: true });
    return NextResponse.json({ category });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await requireAdminSession();
    const { id } = await ctx.params;
    await catalogService.deleteCategory(id);
    revalidateCatalog({ menu: true });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
