import { NextResponse } from 'next/server';

import { documentDraftSchema, documentListQuerySchema } from '@/contracts/documents';
import { documentsService } from '@/server/documents/documents.service';
import { jsonError, requireBusinessContext, requireBusinessReadContext } from '@/server/common/http';

export async function GET(request: Request) {
  try {
    const { businessId } = await requireBusinessReadContext();
    const query = documentListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(await documentsService.list(businessId, query));
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const { businessId } = await requireBusinessContext();
    // The contract has no amount fields except unit prices and discounts; totals are engine-computed.
    const data = documentDraftSchema.parse(await request.json());
    return NextResponse.json(await documentsService.createDraft(businessId, data), { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
