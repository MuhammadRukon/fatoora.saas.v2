import { afterEach, describe, expect, it, vi } from 'vitest';

import { authLandingUrl, clearAuthHint, readAuthHint, setAuthHint } from '../auth-hint';

const KEY = 'Cryptech.authHint';

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  vi.stubGlobal('window', { localStorage, location: { origin: 'https://shop.test' } });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('auth hint', () => {
  it('round-trips set, read, clear', () => {
    stubStorage();
    expect(readAuthHint()).toBe(false);
    setAuthHint();
    expect(readAuthHint()).toBe(true);
    clearAuthHint();
    expect(readAuthHint()).toBe(false);
  });

  it('stores only a boolean flag', () => {
    const data = stubStorage();
    setAuthHint();
    expect(data.get(KEY)).toBe('1');
  });

  it.each(['0', 'true', 'yes', '{}', ''])('treats stored %j as no hint', (value) => {
    stubStorage({ [KEY]: value });
    expect(readAuthHint()).toBe(false);
  });

  it('is false and does not throw without a window (SSR)', () => {
    expect(typeof window).toBe('undefined');
    expect(readAuthHint()).toBe(false);
    expect(() => setAuthHint()).not.toThrow();
    expect(() => clearAuthHint()).not.toThrow();
  });

  it('swallows storage errors', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('window', { localStorage: { getItem: boom, setItem: boom, removeItem: boom } });
    expect(readAuthHint()).toBe(false);
    expect(() => setAuthHint()).not.toThrow();
    expect(() => clearAuthHint()).not.toThrow();
  });
});

describe('authLandingUrl', () => {
  it('adds auth=1 and keeps the path, query and hash', () => {
    stubStorage();
    expect(authLandingUrl('/')).toBe('/?auth=1');
    expect(authLandingUrl('/account/orders?page=2#top')).toBe('/account/orders?page=2&auth=1#top');
  });

  it('leaves other origins untouched', () => {
    stubStorage();
    expect(authLandingUrl('https://evil.test/x')).toBe('https://evil.test/x');
  });
});
