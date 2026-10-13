// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ status: 'unauthenticated' as string, update: vi.fn() }));
const storage = vi.hoisted(() => {
  const data = new Map<string, string>();
  const api = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  // Node's own `localStorage` getter shadows jsdom's (undefined without --localstorage-file).
  Object.defineProperty(globalThis, 'localStorage', { value: api, configurable: true });
  return api;
});
vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: unknown }) => children,
  useSession: () => ({ status: session.status, update: session.update }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/modules/cart/hooks', () => ({ useGuestCartMerge: () => undefined }));

import { clearAuthHint, readAuthHint, setAuthHint } from '@/lib/auth-hint';
import { AuthHintSync } from '../providers';

beforeEach(() => {
  storage.clear();
  session.status = 'unauthenticated';
  session.update.mockReset();
  window.history.replaceState(null, '', '/');
});
afterEach(() => clearAuthHint());

describe('AuthHintSync', () => {
  it('guest without hint: no session request, hint untouched', () => {
    render(<AuthHintSync />);
    expect(session.update).not.toHaveBeenCalled();
    expect(readAuthHint()).toBe(false);
  });

  it('hint present: asks for the session once, and a fresh unauthenticated status does not clear it', () => {
    setAuthHint();
    render(<AuthHintSync />);
    expect(session.update).toHaveBeenCalledTimes(1);
    expect(readAuthHint()).toBe(true);
  });

  it('OAuth landing (?auth=1): asks for the session and strips the param', () => {
    window.history.replaceState(null, '', '/products?x=1&auth=1');
    render(<AuthHintSync />);
    expect(session.update).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?x=1');
  });

  it('page already fetching (status loading): no second request', () => {
    setAuthHint();
    session.status = 'loading';
    render(<AuthHintSync />);
    expect(session.update).not.toHaveBeenCalled();
  });

  it('authenticated sets the hint', () => {
    session.status = 'authenticated';
    render(<AuthHintSync />);
    expect(readAuthHint()).toBe(true);
  });

  it('a fetch that ends unauthenticated (transient error also reads null) keeps the hint', () => {
    setAuthHint();
    session.status = 'loading';
    const { rerender } = render(<AuthHintSync />);
    session.status = 'unauthenticated';
    rerender(<AuthHintSync />);
    expect(readAuthHint()).toBe(true);
  });
});
