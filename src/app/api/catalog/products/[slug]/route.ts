import { NextResponse } from 'next/server';

import { CATALOG_CACHE_CONTROL } from '@/app/api/_lib/cache-control';

import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError } from '@/server/common/http';

export const revalidate = 120;

interface Ctx {
  params: Promise<{ slug: string }>;
}

export async function GET(_: Request, ctx: Ctx) {
  try {
    const { slug } = await ctx.params;
    const product = await catalogService.getPublicProductBySlug(slug);
    return NextResponse.json(product, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  } catch (err) {
    return jsonError(err);
  }
}
