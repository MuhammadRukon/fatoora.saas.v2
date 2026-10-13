import { OrderStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/server/common/errors';
import type {
  PublicReview,
  ReviewableItem,
  ReviewInput,
  ReviewSummary,
} from '@/contracts/reviews';

import { reviewsRepo } from './reviews.repo';

// Names land in cached public HTML: expose only "First L.", never the full name.
function publicAuthorName(name: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return 'Verified buyer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${[...parts[parts.length - 1]][0].toUpperCase()}.`;
}

function toPublicReview(r: {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: Date;
  user: { id: string; name: string | null };
}): PublicReview {
  return {
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    authorName: publicAuthorName(r.user.name),
    createdAt: r.createdAt.toISOString(),
  };
}

export const reviewsService = {
  async listForProduct(productId: string, take?: number): Promise<PublicReview[]> {
    const rows = await reviewsRepo.listByProduct(productId, take);
    return rows.map(toPublicReview);
  },

  async summaryForProduct(productId: string): Promise<ReviewSummary> {
    const agg = await reviewsRepo.summaryByProduct(productId);
    const count = agg._count._all ?? 0;
    const average = count > 0 ? Number(agg._avg.rating ?? 0) : 0;
    return { count, average };
  },

  /**
   * Returns the order items the user is allowed to review now: belongs
   * to a DELIVERED order they own, and has no review yet.
   *
   * NOTE: OrderItem stores only a `productId` reference (snapshotted),
   * not a relation. We resolve product slugs in a single batched
   * lookup so the page loads in O(1) round trips.
   */
  async listReviewableItems(userId: string): Promise<ReviewableItem[]> {
    const items = await prisma.orderItem.findMany({
      where: {
        order: { userId, status: OrderStatus.DELIVERED },
        reviews: { is: null },
        productId: { not: null },
      },
      include: {
        order: { select: { id: true, orderNumber: true, updatedAt: true } },
      },
      orderBy: { id: 'desc' },
    });

    const productIds = Array.from(
      new Set(items.map((it) => it.productId).filter((id): id is string => !!id)),
    );
    const slugMap = new Map<string, string>();
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, slug: true },
      });
      for (const p of products) slugMap.set(p.id, p.slug);
    }

    return items
      .filter((it) => it.productId)
      .map((it) => ({
        orderItemId: it.id,
        orderId: it.orderId,
        orderNumber: it.order.orderNumber,
        productId: it.productId!,
        productName: it.productName,
        productSlug: slugMap.get(it.productId!) ?? '',
        variantName: it.variantName,
        imageUrl: it.imageUrl,
        deliveredAt: it.order.updatedAt.toISOString(),
      }));
  },

  async productSlug(productId: string): Promise<string | null> {
    const p = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
    return p?.slug ?? null;
  },

  /**
   * Submit a review. Guards:
   *   - The order item belongs to the user.
   *   - The parent order has been DELIVERED (verified buyer).
   *   - No prior review exists for this orderItemId (DB unique key
   *     also enforces this; we check explicitly to give a friendly
   *     error message instead of a 500).
   */
  async submit(userId: string, input: ReviewInput) {
    const item = await prisma.orderItem.findUnique({
      where: { id: input.orderItemId },
      include: { order: { select: { userId: true, status: true } } },
    });
    if (!item) throw new NotFoundError('Order item');
    if (item.order.userId !== userId) throw new ForbiddenError('Not your order');
    if (item.order.status !== OrderStatus.DELIVERED) {
      throw new ConflictError('Reviews can only be submitted after delivery');
    }
    if (!item.productId) {
      throw new ValidationError('This item is no longer linked to a product');
    }
    const existing = await reviewsRepo.findByOrderItemId(input.orderItemId);
    if (existing) {
      throw new ConflictError('You have already reviewed this item');
    }

    return prisma.review.create({
      data: {
        userId,
        productId: item.productId,
        orderItemId: input.orderItemId,
        rating: input.rating,
        title: input.title?.trim() || null,
        body: input.body.trim(),
      },
    });
  },
};
