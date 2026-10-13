import { NextResponse } from 'next/server';

import { jsonError, requireAdminSession } from '@/server/common/http';
import { mediaService } from '@/server/media/media.service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const folder = (form.get('folder') as string | null) ?? 'catalog';
    if (!file) {
      return NextResponse.json(
        { code: 'BAD_REQUEST', message: 'No file provided' },
        { status: 400 },
      );
    }
    const asset = await mediaService.uploadImage(file, folder);
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
