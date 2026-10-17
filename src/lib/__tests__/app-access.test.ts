import { describe, expect, it } from 'vitest';

import { isReadOnlyAppPath } from '../app-access';

describe('isReadOnlyAppPath', () => {
  it.each(['/app/invoices', '/app/invoices/abc123', '/app/invoices/abc123/print'])('allows %s for an expired subscription', (p) => {
    expect(isReadOnlyAppPath(p)).toBe(true);
  });

  it.each(['/app', '/app/invoices/new', '/app/customers', '/app/business', '/app/zatca', '/app/invoices/a/b/c', '/app/invoicesx', null])(
    'keeps %s gated',
    (p) => {
      expect(isReadOnlyAppPath(p)).toBe(false);
    },
  );
});
