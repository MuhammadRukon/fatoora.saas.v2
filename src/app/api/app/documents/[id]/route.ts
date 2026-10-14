import { NextResponse } from 'next/server';

import { documentDraftSchema } from '@/contracts/documents';
import { documentsService } from '@/server/documents/documents.service';
import { jsonError, requireBusinessContext } from '@/server/common/http';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Another business's document id is a 404 (the service scopes by businessId), never a 403.
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    return NextResponse.json(await documentsService.get(businessId, id));
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    const data = documentDraftSchema.parse(await request.json());
    return NextResponse.json(await documentsService.updateDraft(businessId, id, data));
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { businessId } = await requireBusinessContext();
    const { id } = await params;
    await documentsService.deleteDraft(businessId, id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
