export interface AnalyticsTopSeller {
  productId: string;
  productName: string;
  productSlug: string | null;
  unitsSold: number;
  revenueCents: number;
}

export interface AnalyticsLowStockVariant {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  variantName: string | null;
  sku: string;
  stock: number;
  threshold: number;
}

export interface AnalyticsOverview {
  revenueCents: number;
  prevRevenueCents: number;
  profitCents: number;
  customersCount: number;
  ordersCount: number;
  topSellers: AnalyticsTopSeller[];
  lowStock: AnalyticsLowStockVariant[];
}
