import { NextResponse } from 'next/server';

import { documentsService } from '@/server/documents/documents.service';
import { issuanceService } from '@/server/documents/issuance.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    await issuanceService.retry(businessId, id);
    return NextResponse.json(await documentsService.get(businessId, id));
  } catch (err) {
    return jsonError(err);
  }
}
