import { NextResponse } from 'next/server';

import { documentsService } from '@/server/documents/documents.service';
import { issuanceService } from '@/server/documents/issuance.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

// 200 even when ZATCA rejected the document: the verdict is `submissionStatus` in the body.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    await issuanceService.issueAndSubmit(businessId, id);
    return NextResponse.json(await documentsService.get(businessId, id));
  } catch (err) {
    return jsonError(err);
  }
}
