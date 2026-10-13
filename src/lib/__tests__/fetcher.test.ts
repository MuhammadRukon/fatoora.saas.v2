import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, apiFetch } from '../fetcher';

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

function jsonResponse(status: number, body: unknown): Response {
  const text = body === null ? '' : JSON.stringify(body);
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetch', () => {
  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, value: 42 }));
    const data = await apiFetch<{ ok: boolean; value: number }>('/api/things');
    expect(data).toEqual({ ok: true, value: 42 });
  });

  it('serialises a JSON body and sets the content-type header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await apiFetch('/api/things', { method: 'POST', body: { name: 'test' } });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'test' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('throws ApiClientError carrying the server payload on non-2xx', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, { code: 'VALIDATION_ERROR', message: 'Bad input' }),
    );
    await expect(apiFetch('/api/things')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 422,
      payload: { code: 'VALIDATION_ERROR', message: 'Bad input' },
    });
  });

  it('returns null for 204 No Content', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await apiFetch('/api/things', { method: 'DELETE' });
    expect(result).toBeNull();
  });

  it('falls back to a generic message when payload is not an ApiError', async () => {
    fetchMock.mockResolvedValue(new Response('Server exploded', { status: 500 }));
    try {
      await apiFetch('/api/things');
      throw new Error('should not reach here');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).status).toBe(500);
      expect((err as ApiClientError).payload).toBeNull();
    }
  });
});
