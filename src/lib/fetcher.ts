/**
 * Typed fetch helper.
 *
 * - Always uses relative URLs (works on client & during SSR via the same
 *   origin), so we never depend on NEXT_PUBLIC_BASE_URL.
 * - Parses JSON automatically.
 * - Throws a typed `ApiClientError` on non-2xx responses so React Query's
 *   `onError` and our UI can react uniformly.
 */
import type { ApiError } from '@/contracts/common';

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly payload: ApiError | null;

  constructor(status: number, message: string, payload: ApiError | null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

export interface FetcherOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

async function parseJson(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(path: string, options: FetcherOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  const res = await fetch(path, init);
  const data = await parseJson(res);

  if (!res.ok) {
    const errorPayload =
      data && typeof data === 'object' && 'code' in (data as Record<string, unknown>)
        ? (data as ApiError)
        : null;
    const message = errorPayload?.message ?? `Request failed with status ${res.status}`;
    throw new ApiClientError(res.status, message, errorPayload);
  }

  return data as T;
}
