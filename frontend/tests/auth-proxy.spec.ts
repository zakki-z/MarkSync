import { expect, test } from '@playwright/test';
import { POST } from '../app/api/auth/[action]/route';
import { authenticate } from '../src/server/documentsProxy';

const context = (action: string) => ({ params: Promise.resolve({ action }) });
const request = (body: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

test('login sets an HttpOnly session without returning its token; logout clears it', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ access_token: 'private.signed.token' });
  try {
    const response = await POST(
      request({ email: 'owner@example.com', password: 'password123' }),
      context('login'),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain(
      'marksync_session=private.signed.token; Path=/; HttpOnly; SameSite=Lax',
    );
    expect(await response.text()).not.toContain('private.signed.token');
    const logout = await POST(request({}), context('logout'));
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
  } finally {
    globalThis.fetch = original;
  }
});

test('upstream validation details never expose credentials or tokens', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { detail: [{ input: 'sensitive-password', token: 'private-token' }] },
      { status: 422 },
    );
  try {
    const response = await POST(
      request({ email: 'bad', password: 'sensitive-password' }),
      context('signup'),
    );
    expect(response.status).toBe(422);
    const body = await response.text();
    expect(body).not.toContain('sensitive-password');
    expect(body).not.toContain('private-token');
    expect(body).toContain('valid email');
  } finally {
    globalThis.fetch = original;
  }
});

test('rejects cross-site mutations before making upstream calls', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({});
  };
  try {
    for (const action of ['login', 'signup', 'logout']) {
      expect((await POST(request({}, 'https://evil.example'), context(action))).status).toBe(403);
    }
    const result = await authenticate(request({}, 'https://evil.example'));
    expect('error' in result && result.error.status).toBe(403);
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});

test('invalid API sessions are rejected and their browser cookie expires', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 401 });
  try {
    const result = await authenticate(
      new Request('http://localhost/api/documents', {
        headers: { Cookie: 'marksync_session=expired' },
      }),
    );
    expect('error' in result && result.error.status).toBe(401);
    expect('error' in result && result.error.headers.get('set-cookie')).toContain('Max-Age=0');
  } finally {
    globalThis.fetch = original;
  }
});

test('signup forwards an optional username and relays only known conflict messages', async () => {
  const original = globalThis.fetch;
  const sent: unknown[] = [];
  let reply: Response = Response.json({ id: 1 }, { status: 201 });
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)));
    return reply;
  };
  try {
    const credentials = { email: 'a@example.com', password: 'password123' };
    expect((await POST(request(credentials), context('signup'))).status).toBe(201);
    expect(
      (await POST(request({ ...credentials, username: ' amber ' }), context('signup'))).status,
    ).toBe(201);
    expect(sent).toEqual([credentials, { ...credentials, username: 'amber' }]);

    reply = Response.json({ detail: 'Username already taken' }, { status: 400 });
    const taken = await POST(request({ ...credentials, username: 'amber' }), context('signup'));
    expect(taken.status).toBe(400);
    expect(await taken.json()).toEqual({ detail: 'Username already taken' });

    reply = Response.json({ detail: 'select * from users' }, { status: 400 });
    const unknown = await POST(request(credentials), context('signup'));
    expect(await unknown.json()).toEqual({ detail: 'Email already registered' });

    const invalid = await POST(request({ ...credentials, username: 42 }), context('signup'));
    expect(invalid.status).toBe(400);
  } finally {
    globalThis.fetch = original;
  }
});
