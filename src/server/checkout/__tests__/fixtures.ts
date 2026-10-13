/**
 * Live-DB fixtures for checkout tests (not a test file). Every row uses a
 * random suffix; ids are tracked so `cleanupCheckoutFixtures` can remove them.
 */
import {
  CodFeeStatus,
  CodFeeType,
  CouponType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PublishStatus,
  type PaymentSettings,
  UserRole,
} from '@prisma/client';
import { expect, vi } from 'vitest';

import { prisma } from '@/lib/prisma';
import { BKASH_ENV, SSLCOMMERZ_ENV } from '@/server/payments/gateway-creds';
import { DEFAULT_PAYMENT_SETTINGS } from '@/server/settings/payment-settings.service';

const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdBrandIds: string[] = [];
const createdCouponIds: string[] = [];

function rand() {
  return Math.random().toString(36).slice(2, 10);
}

const SETTINGS_ID = 'singleton';
type SettingsPatch = Partial<Omit<PaymentSettings, 'id' | 'updatedAt'>>;

/**
 * The PaymentSettings singleton is shared global state. The first mutation in
 * a test snapshots the original row (or its absence); `cleanupCheckoutFixtures`
 * restores it. Files that mutate it, or rely on its defaults, must not run in
 * parallel with each other: they must be named `*.serial.test.ts` so the
 * `settings-serial` project in vitest.config.ts runs them one at a time.
 */
let settingsSnapshot: { row: PaymentSettings | null } | null = null;

async function snapshotSettings() {
  const testPath = expect.getState().testPath ?? '';
  if (!testPath.includes('.serial.test.')) {
    throw new Error(
      'Settings fixtures mutate the shared PaymentSettings singleton and must only be used from ' +
        `a *.serial.test.ts file (the settings-serial vitest project). Rename ${testPath || 'this test file'}.`,
    );
  }
  if (!settingsSnapshot) {
    settingsSnapshot = {
      row: await prisma.paymentSettings.findUnique({ where: { id: SETTINGS_ID } }),
    };
  }
}

/**
 * Blanks every gateway credential env var so every gateway reads as "no
 * credentials" (blank values are falsy). Tests must `vi.unstubAllEnvs()` after.
 */
export function clearGatewayEnv() {
  for (const key of [...BKASH_ENV, ...SSLCOMMERZ_ENV]) vi.stubEnv(key, '');
}

/** An order's audit trail, oldest first. */
export async function eventsFor(orderId: string) {
  return prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
}

/** Upserts the singleton as the migration defaults (COD on, fee off) overlaid with `patch`. */
export async function setPaymentSettings(patch: SettingsPatch = {}) {
  await snapshotSettings();
  const data = {
    ...DEFAULT_PAYMENT_SETTINGS,
    // Fee tests enable the fee without choosing a value; the service default
    // (0) is not a valid FLAT fee, so the fixture keeps a 100 BDT value.
    codFeeValue: 10_000,
    ...patch,
  };
  return prisma.paymentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
}

/** Removes the singleton row so the code under test falls back to defaults. */
export async function deletePaymentSettings() {
  await snapshotSettings();
  await prisma.paymentSettings.deleteMany({ where: { id: SETTINGS_ID } });
}

async function restoreSettings() {
  if (!settingsSnapshot) return;
  const { row } = settingsSnapshot;
  settingsSnapshot = null;
  if (row) {
    const { id, updatedAt, ...data } = row;
    void updatedAt;
    await prisma.paymentSettings.upsert({ where: { id }, create: { id, ...data }, update: data });
  } else {
    await prisma.paymentSettings.deleteMany({ where: { id: SETTINGS_ID } });
  }
}

export async function createAdminUser() {
  const admin = await prisma.user.create({
    data: {
      email: `checkout-admin-${rand()}@example.com`,
      name: 'Admin Test',
      role: UserRole.ADMIN,
    },
  });
  createdUserIds.push(admin.id);
  return admin;
}

export interface ManualOrderOptions {
  userId?: string;
  orderStatus?: OrderStatus;
  method?: PaymentMethod;
  feeStatus?: CodFeeStatus;
  feeCents?: number;
  customerTxnId?: string | null;
  bankRef?: string | null;
  totalCents?: number;
}

/**
 * Hand-built order + payment (no placeOrder, no settings dependency) for
 * payments/orders service tests. Tracked for cleanup via the user.
 */
export async function createManualOrder(opts: ManualOrderOptions = {}) {
  const suffix = rand();
  const totalCents = opts.totalCents ?? 200_000;
  let userId = opts.userId;
  if (!userId) {
    const user = await prisma.user.create({
      data: { email: `checkout-manual-${suffix}@example.com`, name: 'Manual Order Test' },
    });
    createdUserIds.push(user.id);
    userId = user.id;
  }
  const address = await prisma.address.create({
    data: {
      userId,
      recipientName: 'Manual Order Test',
      recipientPhone: '01700000000',
      line1: 'Test Lane 1',
      city: 'Dhaka',
    },
  });
  const order = await prisma.order.create({
    data: {
      orderNumber: `MANUAL-${suffix.toUpperCase()}`,
      userId,
      addressId: address.id,
      status: opts.orderStatus ?? OrderStatus.PENDING,
      shipRecipient: 'Manual Order Test',
      shipPhone: '01700000000',
      shipLine1: 'Test Lane 1',
      shipCity: 'Dhaka',
      shipCountry: 'BD',
      subtotalCents: totalCents,
      totalCents,
    },
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: opts.method ?? PaymentMethod.COD,
      status: PaymentStatus.PENDING,
      amountCents: totalCents,
      feeStatus: opts.feeStatus ?? CodFeeStatus.NONE,
      feeCents: opts.feeCents ?? 0,
      feeType: opts.feeCents ? CodFeeType.FLAT : null,
      feeValue: opts.feeCents ? opts.feeCents : null,
      customerTxnId: opts.customerTxnId ?? null,
      bankRef: opts.bankRef ?? null,
    },
  });
  return { userId, order, payment };
}

export interface CheckoutFixtureOptions {
  stock: number;
  cartQty: number;
  /** When set, creates an active coupon with this perUserLimit. */
  couponPerUserLimit?: number;
  /** Variant selling price in cents (default 100_000). */
  unitPriceCents?: number;
}

/** Creates a user + address + cart (qty of `variant`) and tracks the user for cleanup. */
async function createShopper(items: { variantId: string; quantity: number }[]) {
  const suffix = rand();
  const user = await prisma.user.create({
    data: { email: `checkout-test-${suffix}@example.com`, name: 'Checkout Test' },
  });
  createdUserIds.push(user.id);

  const address = await prisma.address.create({
    data: {
      userId: user.id,
      recipientName: 'Checkout Test',
      recipientPhone: '01700000000',
      line1: 'Test Lane 1',
      city: 'Dhaka',
    },
  });

  const cart = await prisma.cart.create({
    data: { userId: user.id, items: { create: items } },
  });

  return { user, address, cart };
}

export async function createCheckoutFixture(opts: CheckoutFixtureOptions) {
  const suffix = rand();

  const brand = await prisma.brand.create({
    data: { slug: `checkout-test-brand-${suffix}`, name: `Checkout Test Brand ${suffix}` },
  });
  createdBrandIds.push(brand.id);

  const product = await prisma.product.create({
    data: {
      slug: `checkout-test-product-${suffix}`,
      name: `Checkout Test Product ${suffix}`,
      description: 'test fixture',
      brandId: brand.id,
      status: PublishStatus.PUBLISHED,
    },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `CHECKOUT-TEST-${suffix}`,
      buyingPriceCents: 50_000,
      sellingPriceCents: opts.unitPriceCents ?? 100_000,
      stock: opts.stock,
      isActive: true,
    },
  });

  let coupon: Awaited<ReturnType<typeof prisma.coupon.create>> | null = null;
  if (opts.couponPerUserLimit !== undefined) {
    coupon = await prisma.coupon.create({
      data: {
        code: `CHKTEST${suffix}`.toUpperCase(),
        type: CouponType.FIXED,
        value: 1_000,
        perUserLimit: opts.couponPerUserLimit,
        isActive: true,
      },
    });
    createdCouponIds.push(coupon.id);
  }

  const first = await createShopper([{ variantId: variant.id, quantity: opts.cartQty }]);

  return {
    brand,
    product,
    variant,
    coupon,
    user: first.user,
    cart: first.cart,
    address: first.address,
    /** Another user with their own cart against the SAME variant. */
    addShopper: (cartQty: number) => createShopper([{ variantId: variant.id, quantity: cartQty }]),
    /** Another variant (same product) with the given stock. */
    addVariant: (stock: number) =>
      prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `CHECKOUT-TEST-${rand()}`,
          buyingPriceCents: 50_000,
          sellingPriceCents: 100_000,
          stock,
          isActive: true,
        },
      }),
    /** Another user whose cart lists the given variants in the given order. */
    addShopperWithItems: (items: { variantId: string; quantity: number }[]) => createShopper(items),
  };
}

export async function cleanupCheckoutFixtures() {
  const userIds = createdUserIds.splice(0);
  const productIds = createdProductIds.splice(0);
  const brandIds = createdBrandIds.splice(0);
  const couponIds = createdCouponIds.splice(0);

  await restoreSettings();
  // Orders cascade items/payments/events; they must go before users/coupons.
  await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
  // CartItem.variant is restrict, so carts (cascade items) go before products.
  await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.coupon.deleteMany({ where: { id: { in: couponIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.brand.deleteMany({ where: { id: { in: brandIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
