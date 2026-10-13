import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/constants/queryKeys';
import type { CheckoutQuote } from '@/contracts/checkout';
import { buildQuoteBody, isCodFeeActive, isFeeConfigStale } from '../checkout-quote';

describe('buildQuoteBody', () => {
  it('sends only the address when no coupon or method is chosen', () => {
    const body = buildQuoteBody({ addressId: 'a1', couponCode: null, paymentMethod: null });
    expect(JSON.parse(JSON.stringify(body))).toEqual({ addressId: 'a1' });
  });

  it('sends the coupon and method when present', () => {
    const body = buildQuoteBody({ addressId: 'a1', couponCode: 'SAVE10', paymentMethod: 'COD' });
    expect(JSON.parse(JSON.stringify(body))).toEqual({
      addressId: 'a1',
      couponCode: 'SAVE10',
      paymentMethod: 'COD',
    });
  });
});

describe('queryKeys.checkoutQuote', () => {
  const base = { addressId: 'a1', couponCode: null, paymentMethod: 'COD' as const };

  it('is equal for equal selections', () => {
    expect(queryKeys.checkoutQuote(base)).toEqual(queryKeys.checkoutQuote({ ...base }));
  });

  it('differs when any part of the selection differs', () => {
    const key = JSON.stringify(queryKeys.checkoutQuote(base));
    expect(JSON.stringify(queryKeys.checkoutQuote({ ...base, addressId: 'a2' }))).not.toBe(key);
    expect(JSON.stringify(queryKeys.checkoutQuote({ ...base, couponCode: 'X' }))).not.toBe(key);
    expect(JSON.stringify(queryKeys.checkoutQuote({ ...base, paymentMethod: 'BKASH' }))).not.toBe(
      key,
    );
    expect(JSON.stringify(queryKeys.checkoutQuote({ ...base, paymentMethod: null }))).not.toBe(key);
  });
});

describe('isCodFeeActive', () => {
  const quote: CheckoutQuote = {
    subtotalCents: 100_000,
    discountCents: 0,
    shippingCents: 6_000,
    totalCents: 106_000,
    couponCode: null,
    codFeeCents: 10_000,
    dueOnDeliveryCents: 96_000,
    codFeeRule: { type: 'FLAT', value: 10_000 },
  };
  const settled = { paymentMethod: 'COD' as const, quoting: false, quote };

  it('is on for a settled COD quote with a fee, regardless of cached config', () => {
    expect(isCodFeeActive(settled)).toBe(true);
  });

  it('is off while re-quoting, without a quote, or for another method', () => {
    expect(isCodFeeActive({ ...settled, quoting: true })).toBe(false);
    expect(isCodFeeActive({ ...settled, quote: null })).toBe(false);
    expect(isCodFeeActive({ ...settled, paymentMethod: 'BKASH' })).toBe(false);
    expect(isCodFeeActive({ ...settled, paymentMethod: null })).toBe(false);
  });

  it('is off when the quote carries no fee', () => {
    expect(isCodFeeActive({ ...settled, quote: { ...quote, codFeeRule: null } })).toBe(false);
    expect(isCodFeeActive({ ...settled, quote: { ...quote, codFeeCents: 0 } })).toBe(false);
  });
});

describe('isFeeConfigStale', () => {
  it('flags a shown fee that the cached config says is off', () => {
    expect(isFeeConfigStale(true, false)).toBe(true);
  });

  it('is not stale when the config agrees, is unloaded, or no fee shows', () => {
    expect(isFeeConfigStale(true, true)).toBe(false);
    expect(isFeeConfigStale(true, undefined)).toBe(false);
    expect(isFeeConfigStale(false, false)).toBe(false);
  });
});
