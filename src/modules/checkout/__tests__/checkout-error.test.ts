import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@/lib/fetcher';
import {
  checkoutErrorMessage,
  isPaymentMethodUnavailable,
  isTxnIdDuplicate,
  TXN_ID_DUPLICATE_MESSAGE,
} from '../checkout-error';

function apiErr(
  status: number,
  message: string,
  meta?: Record<string, unknown>,
  code: string = 'CONFLICT',
) {
  return new ApiClientError(status, message, { code, message, meta } as never);
}

describe('checkoutErrorMessage', () => {
  it('names the product on 409 insufficient_stock', () => {
    const msg = checkoutErrorMessage(
      apiErr(409, 'conflict', {
        variantId: 'v1',
        productName: 'Foo',
        reason: 'insufficient_stock',
      }),
    );
    expect(msg).toBe('Not enough stock for "Foo". Your cart has been refreshed.');
  });

  it('names the product on 409 unavailable', () => {
    const msg = checkoutErrorMessage(
      apiErr(409, 'conflict', { variantId: 'v1', productName: 'Foo', reason: 'unavailable' }),
    );
    expect(msg).toBe('"Foo" is no longer available. Your cart has been refreshed.');
  });

  it('uses the server message on 409 without meta', () => {
    const msg = checkoutErrorMessage(apiErr(409, 'Your cart changed, please review and try again'));
    expect(msg).toBe('Your cart changed, please review and try again');
  });

  it('uses the server message on 409 with invalid meta', () => {
    expect(
      checkoutErrorMessage(apiErr(409, 'conflict msg', { productName: 'Foo', reason: 'weird' })),
    ).toBe('conflict msg');
    expect(checkoutErrorMessage(apiErr(409, 'conflict msg', { reason: 'unavailable' }))).toBe(
      'conflict msg',
    );
  });

  it('passes through other API errors', () => {
    expect(checkoutErrorMessage(apiErr(500, 'Boom'))).toBe('Boom');
    expect(checkoutErrorMessage(apiErr(400, 'Cart is empty'))).toBe('Cart is empty');
  });

  it('ignores stock meta on non-409 API errors', () => {
    const msg = checkoutErrorMessage(
      apiErr(422, 'Invalid', { variantId: 'v1', productName: 'Foo', reason: 'unavailable' }),
    );
    expect(msg).toBe('Invalid');
  });

  it('falls back for non-API errors', () => {
    expect(checkoutErrorMessage(new Error('x'))).toBe('Could not place order');
  });

  it('maps TXN_ID_DUPLICATE to the "already exists" copy', () => {
    const msg = checkoutErrorMessage(
      apiErr(409, 'Transaction ID already exists', undefined, 'TXN_ID_DUPLICATE'),
    );
    expect(msg).toBe(
      'Transaction ID already exists. You can place the order without a transaction ID and contact admin.',
    );
    expect(msg).toBe(TXN_ID_DUPLICATE_MESSAGE);
  });

  it('maps the disabled-method 400 to "That payment method is no longer available"', () => {
    const msg = checkoutErrorMessage(
      apiErr(
        400,
        'server wording',
        { reason: 'payment_method_unavailable', method: 'BKASH' },
        'BAD_REQUEST',
      ),
    );
    expect(msg).toBe('That payment method is no longer available');
  });

  it('does not treat a plain 400 or a non-400 with the same meta as method-unavailable', () => {
    expect(checkoutErrorMessage(apiErr(400, 'Cart is empty', undefined, 'BAD_REQUEST'))).toBe(
      'Cart is empty',
    );
    expect(
      checkoutErrorMessage(
        apiErr(422, 'Invalid', { reason: 'payment_method_unavailable', method: 'BKASH' }),
      ),
    ).toBe('Invalid');
  });
});

describe('isTxnIdDuplicate', () => {
  it('is true only for a TXN_ID_DUPLICATE ApiClientError', () => {
    expect(isTxnIdDuplicate(apiErr(409, 'x', undefined, 'TXN_ID_DUPLICATE'))).toBe(true);
    expect(isTxnIdDuplicate(apiErr(409, 'x'))).toBe(false);
    expect(isTxnIdDuplicate(new Error('x'))).toBe(false);
  });
});

describe('isPaymentMethodUnavailable', () => {
  it('is true only for the 400 with payment_method_unavailable meta', () => {
    const meta = { reason: 'payment_method_unavailable', method: 'COD' };
    expect(isPaymentMethodUnavailable(apiErr(400, 'x', meta, 'BAD_REQUEST'))).toBe(true);
    expect(isPaymentMethodUnavailable(apiErr(409, 'x', meta))).toBe(false);
    expect(isPaymentMethodUnavailable(apiErr(400, 'x', { reason: 'other' }, 'BAD_REQUEST'))).toBe(
      false,
    );
    expect(isPaymentMethodUnavailable(new Error('x'))).toBe(false);
  });
});
