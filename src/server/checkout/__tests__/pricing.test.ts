import { CodFeeType, PaymentMethod, type PaymentSettings } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { couponsService } from '@/server/coupons/coupons.service';

import { priceOrder } from '../pricing';

vi.mock('@/server/coupons/coupons.service', () => ({ couponsService: { validate: vi.fn() } }));

beforeEach(() => {
  vi.mocked(couponsService.validate).mockReset();
});

/** Pricing with no coupon never touches the database client. */
const NO_DB = {} as never;

const DHAKA = { city: 'Dhaka' };

function price(unitPriceCents: number, quantity = 1) {
  return priceOrder(NO_DB, {
    userId: 'user-1',
    address: DHAKA,
    lines: [{ unitPriceCents, quantity }],
  });
}

describe('priceOrder totals', () => {
  it('is subtotal - discount + shipping', async () => {
    const priced = await price(100_000);
    expect(priced).toMatchObject({
      subtotalCents: 100_000,
      discountCents: 0,
      shippingCents: 6_000,
      totalCents: 106_000,
      couponId: null,
      couponCode: null,
      plan: null,
    });
  });

  it('sums every line by quantity', async () => {
    const priced = await priceOrder(NO_DB, {
      userId: 'user-1',
      address: DHAKA,
      lines: [
        { unitPriceCents: 10_000, quantity: 2 },
        { unitPriceCents: 5_000, quantity: 1 },
      ],
    });
    expect(priced.subtotalCents).toBe(25_000);
    expect(priced.totalCents).toBe(25_000 + priced.shippingCents);
  });

  it('charges no shipping at the free-shipping threshold', async () => {
    const priced = await price(500_000);
    expect(priced.shippingCents).toBe(0);
    expect(priced.totalCents).toBe(500_000);
  });
});

describe('priceOrder coupon', () => {
  function mockCoupon(discountCents: number) {
    vi.mocked(couponsService.validate).mockResolvedValue({
      id: 'coupon-1',
      code: 'SAVE',
      discountCents,
    });
  }

  it('validates against the subtotal on the given client and reports the coupon', async () => {
    mockCoupon(1_000);
    const priced = await priceOrder(NO_DB, {
      userId: 'user-1',
      address: DHAKA,
      lines: [{ unitPriceCents: 100_000, quantity: 1 }],
      couponCode: 'save',
    });

    expect(couponsService.validate).toHaveBeenCalledWith(
      { code: 'save', userId: 'user-1', subtotalCents: 100_000 },
      NO_DB,
    );
    expect(priced).toMatchObject({
      discountCents: 1_000,
      couponId: 'coupon-1',
      couponCode: 'SAVE',
      totalCents: 105_000,
    });
  });

  it('never lets the discount push the items below zero', async () => {
    mockCoupon(900);
    const priced = await priceOrder(NO_DB, {
      userId: 'user-1',
      address: DHAKA,
      lines: [{ unitPriceCents: 500, quantity: 1 }],
      couponCode: 'SAVE',
    });
    expect(priced.totalCents).toBe(6_000);
  });
});

describe('priceOrder COD fee', () => {
  const settings = {
    codFeeEnabled: true,
    codFeeType: CodFeeType.FLAT,
    codFeeValue: 10_000,
  } as PaymentSettings;

  it('resolves the fee for the requested method without changing the total', async () => {
    const priced = await priceOrder(NO_DB, {
      userId: 'user-1',
      address: DHAKA,
      lines: [{ unitPriceCents: 100_000, quantity: 1 }],
      payment: { method: PaymentMethod.COD, settings },
    });
    expect(priced.totalCents).toBe(106_000);
    expect(priced.plan.fee).toEqual({
      feeCents: 10_000,
      rule: { type: CodFeeType.FLAT, value: 10_000 },
    });
  });

  it('resolves no fee for a method that takes none', async () => {
    const priced = await priceOrder(NO_DB, {
      userId: 'user-1',
      address: DHAKA,
      lines: [{ unitPriceCents: 100_000, quantity: 1 }],
      payment: { method: PaymentMethod.BANK_TRANSFER, settings },
    });
    expect(priced.plan.fee).toBeNull();
  });

  it('has no plan when no payment method is given', async () => {
    expect((await price(100_000)).plan).toBeNull();
  });
});
