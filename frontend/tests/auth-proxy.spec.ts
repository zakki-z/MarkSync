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
