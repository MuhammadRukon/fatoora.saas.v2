import { NextResponse } from 'next/server';

import { CATALOG_CACHE_CONTROL } from '@/app/api/_lib/cache-control';
import { productListQuerySchema } from '@/contracts/catalog';
import { catalogService } from '@/server/catalog/catalog.service';
import { jsonError } from '@/server/common/http';
import { enforceIpLimit } from '@/server/common/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('q')) await enforceIpLimit(request, 'catalog-q');
    const query = productListQuerySchema.parse(Object.fromEntries(url.searchParams));
    const data = await catalogService.listPublicProducts(query);
    return NextResponse.json(data, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
  } catch (err) {
    return jsonError(err);
  }
}
