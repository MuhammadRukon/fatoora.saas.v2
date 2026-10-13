import { OrderStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type {
  AnalyticsLowStockVariant,
  AnalyticsOverview,
  AnalyticsTopSeller,
} from '@/contracts/analytics';

const REVENUE_STATUSES = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export const analyticsService = {
  /**
   * Single roll-up query used by the admin dashboard. Each metric uses
   * a narrowly-scoped Prisma query so it's easy to swap in materialised
   * views or a separate analytics store later without touching the UI.
   */
  async overview(): Promise<AnalyticsOverview> {
    const since = daysAgo(30);
    const sincePrev = daysAgo(60);

    const [revenueRow, prevRevenueRow, periodItems, customersAgg, ordersCount, lowStockRows] =
      await Promise.all([
        prisma.order.aggregate({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } },
          _sum: { totalCents: true },
        }),
        prisma.order.aggregate({
          where: {
            status: { in: REVENUE_STATUSES },
            createdAt: { gte: sincePrev, lt: since },
          },
          _sum: { totalCents: true },
        }),
        prisma.orderItem.findMany({
          where: { order: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } } },
          select: {
            productId: true,
            productName: true,
            unitPriceCents: true,
            buyingPriceCents: true,
            quantity: true,
          },
        }),
        prisma.order.findMany({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } },
          select: { userId: true },
          distinct: ['userId'],
        }),
        prisma.order.count({
          where: { status: { in: REVENUE_STATUSES }, createdAt: { gte: since } },
        }),
        prisma.productVariant.findMany({
          where: {
            isActive: true,
            stock: { lte: prisma.productVariant.fields.lowStockThreshold },
          },
          orderBy: { stock: 'asc' },
          take: 8,
          include: {
            product: { select: { id: true, name: true, slug: true } },
          },
        }),
      ]);

    let profitCents = 0;
    const productAgg = new Map<
      string,
      { productName: string; unitsSold: number; revenueCents: number }
    >();
    for (const row of periodItems) {
      profitCents += (row.unitPriceCents - row.buyingPriceCents) * row.quantity;
      if (!row.productId) continue;
      const current = productAgg.get(row.productId) ?? {
        productName: row.productName,
        unitsSold: 0,
        revenueCents: 0,
      };
      current.unitsSold += row.quantity;
      current.revenueCents += row.unitPriceCents * row.quantity;
      productAgg.set(row.productId, current);
    }

    const topSellerEntries = Array.from(productAgg.entries())
      .sort((a, b) => b[1].unitsSold - a[1].unitsSold)
      .slice(0, 5);

    const productIds = topSellerEntries.map(([id]) => id);
    const productMap = new Map<string, { slug: string }>();
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, slug: true },
      });
      for (const p of products) productMap.set(p.id, { slug: p.slug });
    }

    const topSellers: AnalyticsTopSeller[] = topSellerEntries.map(([productId, agg]) => ({
      productId,
      productName: agg.productName,
      productSlug: productMap.get(productId)?.slug ?? null,
      unitsSold: agg.unitsSold,
      revenueCents: agg.revenueCents,
    }));

    const lowStock: AnalyticsLowStockVariant[] = lowStockRows.map((v) => ({
      variantId: v.id,
      productId: v.product.id,
      productName: v.product.name,
      productSlug: v.product.slug,
      variantName: v.name,
      sku: v.sku,
      stock: v.stock,
      threshold: v.lowStockThreshold,
    }));

    return {
      revenueCents: revenueRow._sum.totalCents ?? 0,
      prevRevenueCents: prevRevenueRow._sum.totalCents ?? 0,
      profitCents,
      customersCount: customersAgg.length,
      ordersCount,
      topSellers,
      lowStock,
    };
  },
};
