import { describe, expect, it } from 'vitest';

import { safeCallbackUrl } from '../safe-redirect';

describe('safeCallbackUrl', () => {
  it('keeps same-origin paths', () => {
    expect(safeCallbackUrl('/app/documents?x=1')).toBe('/app/documents?x=1');
    expect(safeCallbackUrl('/')).toBe('/');
  });

  it.each([
    null,
    '',
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'javascript:alert(1)',
    'evil.com',
  ])('falls back to / for %j', (v) => {
    expect(safeCallbackUrl(v)).toBe('/');
  });
});
