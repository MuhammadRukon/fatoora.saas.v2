import { NextResponse } from 'next/server';
import { WarrantyStatus } from '@prisma/client';

import { warrantyService } from '@/server/warranty/warranty.service';
import { jsonError, requireAdminSession } from '@/server/common/http';

function parseStatus(value: string | null): WarrantyStatus | undefined {
  if (!value) return undefined;
  return Object.values(WarrantyStatus).includes(value as WarrantyStatus)
    ? (value as WarrantyStatus)
    : undefined;
}

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const status = parseStatus(url.searchParams.get('status'));
    const items = await warrantyService.listAll({ status });
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
