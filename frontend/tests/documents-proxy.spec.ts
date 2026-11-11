import { expect, test } from '@playwright/test';
import {
  GET as listInWorkspace,
  POST as createInWorkspace,
} from '../app/api/workspaces/[id]/documents/route';
import { GET as read, PUT as update, DELETE as remove } from '../app/api/documents/[id]/route';
import { fetchUpstream } from '../src/server/upstream';

const withFetch = async (
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  run: () => Promise<void>,
) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(String(input), init);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const request = (method: string, cookie?: string, body?: unknown) =>
  new Request('http://localhost/api/documents', {
    method,
    headers: { ...(cookie && { Cookie: cookie }), Origin: 'http://localhost:3000' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
const signedIn = 'marksync_session=test-token';
const workspace = { params: Promise.resolve({ id: '5' }) };
const doc = { params: Promise.resolve({ id: '1' }) };

test('forwards the bearer token and the draft for every authenticated document operation', async () => {
  const calls: string[] = [];
  await withFetch(
    (url, init) => {
      if (url.endsWith('/auth/me')) return Response.json({ id: 7 });
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token');
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${new URL(url).port}${new URL(url).pathname}`);
      if (url.endsWith('/markdown')) return new Response('live text');
      // Only a new document carries Markdown; updates never do.
      if (init?.body)
        expect(JSON.parse(String(init.body))).toEqual({
          title: 'Title',
          ...(method === 'POST' && { markdown: 'Text' }),
          visibility: 'PUBLIC',
        });
      return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 1 });
    },
    async () => {
      const draft = { title: 'Title', markdown: 'Text', visibility: 'PUBLIC', authorId: '99' };
      for (const response of [
        await listInWorkspace(request('GET', signedIn), workspace),
        await createInWorkspace(request('POST', signedIn, draft), workspace),
        await read(request('GET', signedIn), doc),
        await update(request('PUT', signedIn, draft), doc),
        await remove(request('DELETE', signedIn), doc),
      ])
        expect(response.ok).toBe(true);
    },
  );
  expect(calls).toEqual([
    'GET 8082/api/workspaces/5/documents',
    'POST 8082/api/workspaces/5/documents',
    'GET 8082/api/documents/1',
    'GET 3001/documents/1/markdown',
    'PUT 8082/api/documents/1',
    'DELETE 8082/api/documents/1',
  ]);
});

test('public reads work without a session and with an expired one', async () => {
  const seen: Array<string | null> = [];
  await withFetch(
    (url, init) => {
      if (url.endsWith('/auth/me')) return new Response(null, { status: 401 });
      seen.push(new Headers(init?.headers).get('Authorization'));
      if (url.endsWith('/markdown')) return new Response('live text');
      return Response.json({ id: 1, visibility: 'PUBLIC', canEdit: false });
    },
    async () => {
      expect((await read(request('GET'), doc)).status).toBe(200);
      expect((await read(request('GET', 'marksync_session=expired'), doc)).status).toBe(200);
    },
  );
  // Each read asks the Document Service and then the collaboration service, both anonymously.
  expect(seen).toEqual([null, null, null, null]);
});

test('every write and list still requires a session', async () => {
  let upstreamCalls = 0;
  await withFetch(
    () => {
      upstreamCalls++;
      return Response.json({});
    },
    async () => {
      const draft = { title: 'Title', markdown: 'Text' };
      for (const response of [
        await listInWorkspace(request('GET'), workspace),
        await createInWorkspace(request('POST', undefined, draft), workspace),
        await update(request('PUT', undefined, draft), doc),
        await remove(request('DELETE'), doc),
      ])
        expect(response.status).toBe(401);
    },
  );
  expect(upstreamCalls).toBe(0);
});

test('rejects invalid ids and drafts before calling the Document Service', async () => {
  let upstreamCalls = 0;
  await withFetch(
    (url) => {
      if (url.endsWith('/auth/me')) return Response.json({ id: 7 });
      upstreamCalls++;
      return Response.json({});
    },
    async () => {
      const bad = { params: Promise.resolve({ id: 'abc' }) };
      expect((await read(request('GET'), bad)).status).toBe(400);
      expect((await listInWorkspace(request('GET', signedIn), bad)).status).toBe(400);
      expect(
        (
          await update(
            request('PUT', signedIn, { title: 'T', markdown: '', visibility: 'SECRET' }),
            doc,
          )
        ).status,
      ).toBe(400);
      expect(
        (await update(request('PUT', signedIn, { title: ' ', markdown: '' }), doc)).status,
      ).toBe(400);
    },
  );
  expect(upstreamCalls).toBe(0);
});

test('preserves caller cancellation and times out even with a caller signal', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
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
    await expect(
      fetchUpstream('http://upstream', { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(9_900);
    expect(Date.now() - started).toBeLessThan(12_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a read returns the live text in place of the stored seed copy', async () => {
  await withFetch(
    (url) => {
      if (url.endsWith('/markdown')) return new Response('# Live\n\nedited just now');
      return Response.json({ id: 1, title: 'T', markdown: 'stale seed', canEdit: true });
    },
    async () => {
      const response = await read(request('GET'), doc);
      expect(await response.json()).toEqual({
        id: 1,
        title: 'T',
        markdown: '# Live\n\nedited just now',
        canEdit: true,
      });
    },
  );
});

test('a read fails instead of showing stale text when the live text is unavailable', async () => {
  for (const live of [() => new Response(null, { status: 503 }), () => Promise.reject(new Error())])
    await withFetch(
      (url) =>
        url.endsWith('/markdown') ? live() : Response.json({ id: 1, markdown: 'stale seed' }),
      async () => expect((await read(request('GET'), doc)).status).toBe(502),
    );
});

test('a refused read never asks for the live text', async () => {
  const asked: string[] = [];
  await withFetch(
    (url) => {
      asked.push(url);
      return new Response(null, { status: 403 });
    },
    async () => expect((await read(request('GET'), doc)).status).toBe(403),
  );
  expect(asked.filter((url) => url.endsWith('/markdown'))).toEqual([]);
});

test('an update may omit the Markdown, and a create must carry it', async () => {
  await withFetch(
    (url, init) => {
      if (url.endsWith('/auth/me')) return Response.json({ id: 7 });
      return Response.json(JSON.parse(String(init?.body)));
    },
    async () => {
      const metadataOnly = await update(request('PUT', signedIn, { title: 'Only title' }), doc);
      expect(await metadataOnly.json()).toEqual({ title: 'Only title' });
      const ignored = await update(request('PUT', signedIn, { title: 'T', markdown: 'x' }), doc);
      expect(await ignored.json()).toEqual({ title: 'T' });
      expect(
        (await createInWorkspace(request('POST', signedIn, { title: 'No body' }), workspace))
          .status,
      ).toBe(400);
    },
  );
});
