import { describe, expect, test } from 'bun:test';
import type { FetchFn } from '../src/http';
import { AuthServiceAuthenticator, sessionToken } from '../src/connection-authenticator';
import { HttpWorkspaceAccessChecker } from '../src/workspace-access';

type Handler = (request: Request) => Response | Promise<Response>;
const stub =
  (handler: Handler): FetchFn =>
  (input, init) =>
    Promise.resolve(handler(new Request(input, init)));
/** A fetch that never answers on its own and fails only when the caller's timeout aborts it. */
const hanging: FetchFn = (_input, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
const unreachable: FetchFn = () => Promise.reject(new TypeError('connection refused'));

describe('sessionToken', () => {
  const withCookie = (cookie?: string) =>
    new Request('http://x/ws', cookie ? { headers: { cookie } } : {});
  test('reads the session cookie among others', () => {
    expect(sessionToken(withCookie('a=1; marksync_session=tok; b=2'))).toBe('tok');
  });
  test('is undefined without the cookie', () => {
    expect(sessionToken(withCookie())).toBeUndefined();
    expect(sessionToken(withCookie('other=1'))).toBeUndefined();
  });
});

describe('AuthServiceAuthenticator', () => {
  const profile = { id: 4, email: 'ada@example.com', username: 'ada', role: 'user' };

  test('returns only the id and username, never the email, and sends the token in a header', async () => {
    const authenticator = new AuthServiceAuthenticator(
      'http://auth',
      1000,
      stub((request) => {
        expect(new URL(request.url).pathname).toBe('/auth/me');
        expect(new URL(request.url).search).toBe('');
        expect(request.headers.get('authorization')).toBe('Bearer secret');
        return Response.json(profile);
      }),
    );
    const result = await authenticator.authenticate('secret');
    expect(result).toEqual({ status: 'authenticated', user: { id: 4, displayName: 'ada' } });
    expect(JSON.stringify(result)).not.toContain('example.com');
  });

  test('rejects tokens the auth service refuses', async () => {
    for (const status of [401, 403, 404]) {
      const authenticator = new AuthServiceAuthenticator(
        'http://auth',
        1000,
        stub(() => new Response(null, { status })),
      );
      expect(await authenticator.authenticate('t')).toEqual({ status: 'unauthenticated' });
    }
  });

  test('rejects profiles without a usable id or username', async () => {
    for (const body of [
      {},
      { id: '4', username: 'ada' },
      { id: -1, username: 'ada' },
      { id: 4, username: '' },
    ]) {
      const authenticator = new AuthServiceAuthenticator(
        'http://auth',
        1000,
        stub(() => Response.json(body)),
      );
      expect(await authenticator.authenticate('t')).toEqual({ status: 'unauthenticated' });
    }
  });

  test('reports an unavailable auth service instead of authenticating', async () => {
    for (const fetchFn of [
      stub(() => new Response(null, { status: 503 })),
      stub(() => new Response('not json', { status: 200 })),
      unreachable,
      hanging,
    ]) {
      const authenticator = new AuthServiceAuthenticator('http://auth', 10, fetchFn);
      expect(await authenticator.authenticate('t')).toEqual({ status: 'unavailable' });
    }
  });
});

describe('HttpWorkspaceAccessChecker', () => {
  const checker = (fetchFn: FetchFn) => new HttpWorkspaceAccessChecker('http://ws', 10, fetchFn);

  test('grants any member and asks the membership endpoint with the user token', async () => {
    const decision = await checker(
      stub((request) => {
        expect(new URL(request.url).pathname).toBe('/api/workspaces/12/membership');
        expect(request.headers.get('authorization')).toBe('Bearer secret');
        return Response.json({ role: 'VIEWER', canEdit: false });
      }),
    ).check('secret', 12);
    expect(decision).toBe('granted');
  });

  test('denies non-members (404) and forbidden callers (403)', async () => {
    for (const status of [403, 404]) {
      expect(await checker(stub(() => new Response(null, { status }))).check('t', 1)).toBe(
        'denied',
      );
    }
  });

  test('reports an expired or invalid token as unauthenticated', async () => {
    expect(await checker(stub(() => new Response(null, { status: 401 }))).check('t', 1)).toBe(
      'unauthenticated',
    );
  });

  test('fails closed when the workspace service errors, is unreachable or times out', async () => {
    for (const fetchFn of [
      stub(() => new Response(null, { status: 500 })),
      stub(() => new Response(null, { status: 503 })),
      stub(() => new Response(null, { status: 429 })),
      unreachable,
      hanging,
    ]) {
      expect(await checker(fetchFn).check('t', 1)).toBe('unavailable');
    }
  });
});
