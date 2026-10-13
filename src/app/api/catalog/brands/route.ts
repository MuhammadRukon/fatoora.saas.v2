import { NextResponse } from 'next/server';

import { CATALOG_CACHE_CONTROL } from '@/app/api/_lib/cache-control';
import { catalogService } from '@/server/catalog/catalog.service';

export const revalidate = 60;

export async function GET() {
  const items = await catalogService.listPublicBrands();
  return NextResponse.json({ items }, { headers: { 'Cache-Control': CATALOG_CACHE_CONTROL } });
}
