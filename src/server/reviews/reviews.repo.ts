import { prisma } from '@/lib/prisma';

export const reviewsRepo = {
  listByProduct(productId: string, take = 50) {
    return prisma.review.findMany({
      where: { productId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  summaryByProduct(productId: string) {
    return prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    });
  },

  findByOrderItemId(orderItemId: string) {
    return prisma.review.findUnique({ where: { orderItemId } });
  },
};
