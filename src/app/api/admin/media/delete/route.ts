import { NextResponse } from 'next/server';
import { z } from 'zod';

import { jsonError, requireAdminSession } from '@/server/common/http';
import { mediaService } from '@/server/media/media.service';

const bodySchema = z.object({ publicId: z.string().min(1) });

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const { publicId } = bodySchema.parse(await request.json());
    await mediaService.deleteImage(publicId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return jsonError(err);
  }
}
