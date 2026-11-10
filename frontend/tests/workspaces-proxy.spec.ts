import { expect, test } from '@playwright/test';
import { GET as list, POST as create } from '../app/api/workspaces/route';
import { GET as read, PATCH as update, DELETE as remove } from '../app/api/workspaces/[id]/route';

test('forwards the bearer token and body for every workspace operation', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
    const url = String(input);
    if (url.endsWith('/auth/me')) return Response.json({ id: 7 });
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${new URL(url).pathname}`);
    if (init?.body) expect(JSON.parse(String(init.body))).toEqual({ name: 'Team' });
    return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 1 });
  };
  const request = (method: string) =>
    new Request('http://localhost/api/workspaces', {
      method,
      headers: { Cookie: 'marksync_session=test-token', Origin: 'http://localhost:3000' },
      ...(method === 'POST' || method === 'PATCH'
        ? { body: JSON.stringify({ name: 'Team' }) }
        : {}),
    });
  const context = { params: Promise.resolve({ id: '1' }) };
  try {
    const responses = [
      await list(request('GET')),
      await create(request('POST')),
      await read(request('GET'), context),
      await update(request('PATCH'), context),
      await remove(request('DELETE'), context),
    ];
    for (const response of responses) expect(response.ok).toBe(true);
    expect(calls).toEqual([
      'GET /api/workspaces',
      'POST /api/workspaces',
      'GET /api/workspaces/1',
      'PATCH /api/workspaces/1',
      'DELETE /api/workspaces/1',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects requests without a session and invalid ids', async () => {
  const anonymous = new Request('http://localhost/api/workspaces', {
    headers: { Origin: 'http://localhost:3000' },
  });
  expect((await list(anonymous)).status).toBe(401);
  const response = await read(anonymous, { params: Promise.resolve({ id: 'abc' }) });
  expect(response.status).toBe(400);
});
