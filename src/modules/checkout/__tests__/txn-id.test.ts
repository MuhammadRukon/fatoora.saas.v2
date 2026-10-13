import { describe, expect, it } from 'vitest';

import {
  buildTxnConfirmText,
  buildTxnDuplicateOnOrderMessage,
  parseTxnIdInput,
} from '../txn-id';

describe('parseTxnIdInput', () => {
  it('treats blank input as empty', () => {
    expect(parseTxnIdInput('')).toEqual({ status: 'empty' });
    expect(parseTxnIdInput('   ')).toEqual({ status: 'empty' });
  });

  it('trims and uppercases a valid id', () => {
    expect(parseTxnIdInput(' abc12345 ')).toEqual({ status: 'valid', value: 'ABC12345' });
  });

  it('flags ids outside 6-30 characters', () => {
    expect(parseTxnIdInput('abc12').status).toBe('invalid');
    expect(parseTxnIdInput('a'.repeat(31)).status).toBe('invalid');
    expect(parseTxnIdInput('a'.repeat(6)).status).toBe('valid');
    expect(parseTxnIdInput('a'.repeat(30)).status).toBe('valid');
  });

  it('flags non-alphanumeric ids', () => {
    expect(parseTxnIdInput('abc-12345').status).toBe('invalid');
    expect(parseTxnIdInput('abc 12345').status).toBe('invalid');
  });
});

describe('buildTxnConfirmText', () => {
  it('includes the immutability warning and the admin phone', () => {
    expect(buildTxnConfirmText('01800000000')).toBe(
      'Are you sure the transaction ID is correct? It cannot be edited after submission. If it is wrong, contact admin at 01800000000. Your order and confirmation fee are safe.',
    );
  });

  it('drops the phone when there is none', () => {
    expect(buildTxnConfirmText(null)).toBe(
      'Are you sure the transaction ID is correct? It cannot be edited after submission. If it is wrong, contact admin. Your order and confirmation fee are safe.',
    );
  });
});

describe('buildTxnDuplicateOnOrderMessage', () => {
  it('points the customer at admin and reveals nothing about the other order', () => {
    expect(buildTxnDuplicateOnOrderMessage('01800000000')).toBe(
      'Transaction ID already exists. Please contact admin at 01800000000.',
    );
    expect(buildTxnDuplicateOnOrderMessage(null)).toBe(
      'Transaction ID already exists. Please contact admin.',
    );
  });
});
