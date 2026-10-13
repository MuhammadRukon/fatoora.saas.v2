/**
 * Guard against pointing local tooling (dev server, tests, seed, migrate...) at a
 * non-local database. Pure: callers pass the URLs in; nothing is read from the environment.
 *
 * An unescaped "/" in a password moves part of it into the URL path, so such paths print
 * as `/(redacted)`.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const HOST_OVERRIDE_PARAMS = new Set(['host', 'hostaddr']);
const DEFAULT_PORT = '5432';
const REDACTED_PATH = '/(redacted)';

function parse(raw: string, label: string): URL {
  try {
    return new URL(raw);
  } catch {
    // Never echo the input: it may contain a password.
    throw new Error(`${label} is not a valid URL`);
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

/** First path segment (with its leading "/"), or `/(redacted)` for a suspicious path. */
function safePath(url: URL): string {
  if (url.pathname.includes('@') || url.pathname.includes(':')) return REDACTED_PATH;
  const first = url.pathname.split('/')[1];
  return first ? `/${first}` : '';
}

/** `<host[:port]>/<database>` of a connection URL, without credentials or query. */
export function describeTarget(raw: string): string {
  const url = parse(raw, 'database URL');
  const path = safePath(url);
  // The port is dropped when the path is redacted: it may be a credential fragment.
  return `${path === REDACTED_PATH ? hostOf(url) : url.host.toLowerCase()}${path}`;
}

function assertLocal(raw: string, label: string): URL {
  const url = parse(raw, label);
  const host = hostOf(url);

  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${label} points to a non-local host: ${host || '(none)'}${safePath(url)}. ` +
        'Only localhost, 127.0.0.1 and [::1] are allowed.',
    );
  }

  for (const key of url.searchParams.keys()) {
    if (HOST_OVERRIDE_PARAMS.has(key.toLowerCase())) {
      throw new Error(
        `${label} must not contain a host or hostaddr query parameter ` +
          `(target ${host}${safePath(url)}).`,
      );
    }
  }

  return url;
}

/** Canonical host:port/db so equivalent spellings of one database compare equal. */
function identity(url: URL): string {
  const host = LOCAL_HOSTS.has(hostOf(url)) ? 'localhost' : hostOf(url);
  const port = url.port || DEFAULT_PORT;
  const path = url.pathname.toLowerCase().replace(/\/+$/, '');
  return `${host}:${port}${path}`;
}

export function assertLocalDatabase({
  databaseUrl,
  shadowUrl,
  requireShadow = false,
}: {
  databaseUrl?: string;
  shadowUrl?: string;
  requireShadow?: boolean;
}): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const database = assertLocal(databaseUrl, 'DATABASE_URL');

  if (!shadowUrl) {
    if (requireShadow) {
      throw new Error('SHADOW_DATABASE_URL is not set');
    }
    return;
  }

  const shadow = assertLocal(shadowUrl, 'SHADOW_DATABASE_URL');
  if (identity(shadow) === identity(database)) {
    throw new Error(
      `SHADOW_DATABASE_URL must differ from DATABASE_URL ` +
        `(both are ${hostOf(shadow)}${safePath(shadow)}).`,
    );
  }
}
