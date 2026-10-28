import { expect, test } from '@playwright/test';
import { GET as list, POST as create } from '../app/api/documents/route';
import { GET as read, PUT as update, DELETE as remove } from '../app/api/documents/[id]/route';
import { fetchUpstream } from '../src/server/upstream';

test('forwards the authenticated bearer token for every document operation', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    const url = String(input);
    if (url.endsWith('/auth/me')) return Response.json({ id: 7 });
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${new URL(url).pathname}`);
    if (init?.body) expect(JSON.parse(String(init.body))).toEqual({ title: 'Title', markdown: 'Text' });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    const document = { id: 1, authorId: '7', title: 'Title', markdown: 'Text' };
    return Response.json(url.endsWith('/documents') && method === 'GET' ? [document] : document);
  };
  const request = (method: string) => new Request('http://localhost/api/documents', {
    method, headers: { Authorization: 'Bearer test-token' },
    ...(method === 'POST' || method === 'PUT'
      ? { body: JSON.stringify({ title: 'Title', markdown: 'Text', authorId: '99' }) } : {}),
  });
  const context = { params: Promise.resolve({ id: '1' }) };
  try {
    for (const response of [await list(request('GET')), await create(request('POST')),
      await read(request('GET'), context), await update(request('PUT'), context),
      await remove(request('DELETE'), context)]) expect(response?.ok).toBe(true);
    expect(calls).toEqual([
      'GET /api/documents', 'POST /api/documents', 'GET /api/documents/1',
      'GET /api/documents/1', 'PUT /api/documents/1', 'GET /api/documents/1', 'DELETE /api/documents/1',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preserves caller cancellation and times out even with a caller signal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init!.signal!;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    const caller = new AbortController();
    const pending = fetchUpstream('http://upstream', { signal: caller.signal });
    caller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const started = Date.now();
    await expect(fetchUpstream('http://upstream', { signal: new AbortController().signal }))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_900);
    expect(Date.now() - started).toBeLessThan(12_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
