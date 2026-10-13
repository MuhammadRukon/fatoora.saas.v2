'use client';

import Link from 'next/link';
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';
import { formatBDT } from '@/server/common/money';

import { useAdminAnalyticsOverview } from '@/modules/admin/analytics/hooks';

function pctChange(current: number, prev: number): number {
  if (prev === 0) return current === 0 ? 0 : 100;
  return ((current - prev) / prev) * 100;
}

export default function Dashboard() {
  const overview = useAdminAnalyticsOverview();

  if (overview.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }
  if (overview.error || !overview.data) {
    return <div className="p-6 text-destructive">Could not load analytics.</div>;
  }
  const data = overview.data;
  const change = pctChange(data.revenueCents, data.prevRevenueCents);
  const TrendIcon = change >= 0 ? IconTrendingUp : IconTrendingDown;

  return (
    <div className="@container/main flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Live metrics for the last 30 days. Compared against the prior 30-day window.
        </p>
      </div>

      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Revenue (30d)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {formatBDT(data.revenueCents)}
            </CardTitle>
            <CardAction>
              <Badge variant="outline" className="gap-1">
                <TrendIcon size={12} />
                {change >= 0 ? '+' : ''}
                {change.toFixed(1)}%
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Prior 30 days: {formatBDT(data.prevRevenueCents)}
          </CardContent>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Profit (30d)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {formatBDT(data.profitCents)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Selling price minus buying price across all completed line items.
          </CardContent>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Orders (30d)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {data.ordersCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Confirmed, processing, shipped, and delivered combined.
          </CardContent>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Customers (30d)</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {data.customersCount}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Distinct buyers in the period.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top sellers</CardTitle>
            <CardDescription>Most units sold in the last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet in this period.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.topSellers.map((p) => (
                  <li key={p.productId} className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1">
                      {p.productSlug ? (
                        <Link href={`/products/${p.productSlug}`} className="hover:underline">
                          {p.productName}
                        </Link>
                      ) : (
                        p.productName
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {p.unitsSold} sold · {formatBDT(p.revenueCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock alerts</CardTitle>
            <CardDescription>Active variants at or below their threshold.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All variants are above threshold.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.lowStock.map((v) => (
                  <li key={v.variantId} className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1">
                      <Link
                        href={`/dashboard/products`}
                        className="hover:underline"
                        title="Edit the product to restock"
                      >
                        {v.productName}
                      </Link>
                      <span className="text-xs text-muted-foreground ml-1">
                        {v.variantName ? `· ${v.variantName} ` : ''}({v.sku})
                      </span>
                    </span>
                    <span
                      className={`tabular-nums ${
                        v.stock === 0 ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {v.stock} / {v.threshold}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
