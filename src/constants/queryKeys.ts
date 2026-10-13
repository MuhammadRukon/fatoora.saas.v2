import type { PaymentMethod } from '@prisma/client';

import type { GuestCartLine } from '@/contracts/cart';

/**
 * Centralized React Query keys. Keeping them in one place avoids
 * subtle cache misses caused by tuple/string drift between hooks.
 */
export const queryKeys = {
  brand: ['brand'] as const,
  category: ['category'] as const,
  product: ['product'] as const,
  productList: (params?: Record<string, unknown>) => ['product', 'list', params ?? {}] as const,
  productBySlug: (slug: string) => ['product', 'slug', slug] as const,
  cart: ['cart'] as const,
  cartSummary: ['cart', 'summary'] as const,
  cartGuest: (lines: GuestCartLine[]) => ['cart', 'guest', lines] as const,
  orders: ['orders'] as const,
  orderById: (id: string) => ['orders', id] as const,
  /** Customer-facing payment config (enabled methods, fee rule, QR, contact). */
  paymentConfig: ['payment-config'] as const,
  /** Server quote for one checkout selection; a different selection is a different entry. */
  checkoutQuote: (params: {
    addressId: string | null;
    couponCode: string | null;
    paymentMethod: PaymentMethod | null;
  }) =>
    [
      'checkout',
      'quote',
      {
        addressId: params.addressId,
        couponCode: params.couponCode,
        paymentMethod: params.paymentMethod,
      },
    ] as const,
  /** Admin orders: prefix, list, and detail (all details, or one by id). */
  adminOrders: ['admin', 'orders'] as const,
  adminOrdersList: ['admin', 'orders', 'list'] as const,
  adminOrderDetails: ['admin', 'orders', 'detail'] as const,
  adminOrderDetail: (id: string | undefined) => ['admin', 'orders', 'detail', id] as const,
  adminPaymentsPending: ['admin', 'payments', 'pending'] as const,
  user: ['user'] as const,
  userById: (id: string) => ['user', id] as const,
};
