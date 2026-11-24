import { expect, test } from '@playwright/test';
import { ApiError, apiRequest, setUnauthorizedHandler } from '../src/apiClient';

type Reply = { status: number; body?: unknown } | 'network-error';

/** Replaces fetch with a queue of replies per path and records every call. */
function stubFetch(replies: Record<string, Reply[]>) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input);
    calls.push(path);
    const reply = replies[path]?.shift() ?? { status: 200, body: { path } };
    if (reply === 'network-error') throw new TypeError('Failed to fetch');
    return Response.json(reply.body ?? {}, { status: reply.status });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test.describe('API client', () => {
  test('concurrent 401s share one session recovery and each request retries once', async () => {
    const stub = stubFetch({
      '/api/a': [{ status: 401 }],
      '/api/b': [{ status: 401 }],
      '/api/c': [{ status: 401 }],
    });
    let recoveries = 0;
    const remove = setUnauthorizedHandler(async () => {
      recoveries += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return true;
    });
    try {
      const results = await Promise.all(
        ['/api/a', '/api/b', '/api/c'].map((path) => apiRequest<{ path: string }>(path)),
      );
      expect(recoveries).toBe(1);
      expect(results.map((r) => r.path)).toEqual(['/api/a', '/api/b', '/api/c']);
      expect(stub.calls.filter((path) => path === '/api/a')).toHaveLength(2);
    } finally {
      remove();
      stub.restore();
    }
  });

  test('a 401 surfaces only when the session cannot be recovered', async () => {
    const stub = stubFetch({
      '/api/a': [{ status: 401, body: { detail: 'Your session expired.' } }],
      '/api/b': [{ status: 401 }],
    });
    let signOuts = 0;
    const remove = setUnauthorizedHandler(() => {
      signOuts += 1;
      return false;
    });
    try {
      const errors = await Promise.all(
        ['/api/a', '/api/b'].map((path) => apiRequest(path).catch((error: unknown) => error)),
      );
      expect(signOuts).toBe(1);
      for (const error of errors) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(401);
      }
      expect(stub.calls).toEqual(['/api/a', '/api/b']);
    } finally {
      remove();
      stub.restore();
    }
  });

  test('a read retries once after a network error or gateway failure', async () => {
    const stub = stubFetch({
      '/api/offline': ['network-error'],
      '/api/gateway': [{ status: 502 }, { status: 502, body: { detail: 'Still down.' } }],
    });
    try {
      await expect(apiRequest('/api/offline')).resolves.toEqual({ path: '/api/offline' });
      const error = (await apiRequest('/api/gateway').catch((e: unknown) => e)) as ApiError;
      expect(error.status).toBe(502);
      expect(error.message).toBe('Still down.');
      expect(stub.calls.filter((path) => path === '/api/gateway')).toHaveLength(2);
    } finally {
      stub.restore();
    }
  });

  test('a write is never retried automatically and 403/404 are final', async () => {
    const stub = stubFetch({
      '/api/write': [{ status: 502 }],
      '/api/hidden': [{ status: 404, body: { detail: 'Not found' } }],
    });
    try {
      await expect(apiRequest('/api/write', { method: 'POST', data: {} })).rejects.toMatchObject({
        status: 502,
      });
      await expect(apiRequest('/api/hidden')).rejects.toMatchObject({ status: 404 });
      expect(stub.calls).toEqual(['/api/write', '/api/hidden']);
    } finally {
      stub.restore();
    }
  });
});
