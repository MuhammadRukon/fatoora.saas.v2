import { NextResponse } from 'next/server';

import { documentsService } from '@/server/documents/documents.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    return NextResponse.json(await documentsService.duplicateAsDraft(businessId, id), { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
