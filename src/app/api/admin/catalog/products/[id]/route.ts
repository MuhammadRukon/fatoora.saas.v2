import { NextResponse } from 'next/server';

import { revalidateCatalog } from '@/app/api/_lib/revalidate';
import { productInputSchema } from '@/contracts/catalog';
import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_: Request, ctx: Ctx) {
  try {
    await requireAdminSession();
    const { id } = await ctx.params;
    const product = await catalogService.getProduct(id);
    return NextResponse.json({ product });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: Request, ctx: Ctx) {
  try {
    await requireAdminSession();
    const { id } = await ctx.params;
    const input = productInputSchema.parse(await request.json());
    const { slug: previousSlug } = await catalogService.getProduct(id);
    const product = await catalogService.updateProduct(id, input);
    revalidateCatalog({ productSlug: product?.slug, previousSlug });
    return NextResponse.json({ product });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await requireAdminSession();
    const { id } = await ctx.params;
    const { slug } = await catalogService.getProduct(id);
    const result = await catalogService.deleteProduct(id);
    revalidateCatalog({ productSlug: slug });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err);
  }
}
