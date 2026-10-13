/**
 * Boolean "a session probably exists" flag in localStorage. It only decides
 * whether the client asks for a session on load; it is never used for
 * authorization (every API still calls requireSession()). No PII.
 */
const KEY = 'Cryptech.authHint';

/** null on the server or when storage is blocked: the hint is only an optimization. */
function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAuthHint(): boolean {
  try {
    return store()?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAuthHint(): void {
  try {
    store()?.setItem(KEY, '1');
  } catch {
    // quota / blocked
  }
}

export function clearAuthHint(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // quota / blocked
  }
}

/** OAuth callbackUrl that lands on `?auth=1`, which makes Providers fetch the session once. */
export function authLandingUrl(callbackUrl: string): string {
  const url = new URL(callbackUrl, window.location.origin);
  if (url.origin !== window.location.origin) return callbackUrl;
  url.searchParams.set('auth', '1');
  return url.pathname + url.search + url.hash;
}
