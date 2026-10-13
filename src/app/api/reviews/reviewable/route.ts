import { NextResponse } from 'next/server';

import { reviewsService } from '@/server/reviews/reviews.service';
import { jsonError, requireSession } from '@/server/common/http';

export async function GET() {
  try {
    const user = await requireSession();
    const items = await reviewsService.listReviewableItems(user.id);
    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}
