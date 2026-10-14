import { NextResponse } from 'next/server';

import { documentsService } from '@/server/documents/documents.service';
import { issuanceService } from '@/server/documents/issuance.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

// ZATCA calls can take up to 30 s each; the Vercel default would cut the request mid-submission.
export const maxDuration = 60;

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
