import { afterEach, describe, expect, test } from 'bun:test';
import { startServer } from '../src/server';
import { upstreamAccess, type Access } from '../src/auth';
import { parseMessage, type ServerMessage } from '../src/protocol';

const origin = 'http://localhost:8080';
const apps: ReturnType<typeof startServer>[] = [];
const sockets: WebSocket[] = [];
const access: Access = {
  async authenticate(token) {
    return token === 'owner' || token === 'guest'
      ? { id: token === 'owner' ? 1 : 2, email: `${token}@example.com` }
      : null;
  },
  async canAccess(token, id) {
    return id === 1 || (id === 2 && token === 'owner');
  },
};
function app(options: Partial<Parameters<typeof startServer>[0]> = {}) {
  const instance = startServer({ port: 0, origins: [origin], access, ...options });
  apps.push(instance);
  return instance;
}
function client(instance: ReturnType<typeof startServer>, token = 'owner', clientOrigin = origin) {
  const ws = new WebSocket(`ws://localhost:${instance.server.port}/ws`, {
    headers: { Origin: clientOrigin, Cookie: `marksync_session=${token}` },
  });
  sockets.push(ws);
  const messages: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  ws.addEventListener('message', (event) => {
    messages.push(JSON.parse(String(event.data)));
    for (const wake of waiters) wake();
  });
  function next(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error('Expected WebSocket message'));
      }, 2000);
      function check() {
        const index = messages.findIndex(predicate);
        if (index < 0) return;
        const [message] = messages.splice(index, 1);
        clearTimeout(timer);
        waiters.delete(check);
        resolve(message!);
      }
      waiters.add(check);
      check();
    });
  }
  return { ws, next, send: (message: unknown) => ws.send(JSON.stringify(message)) };
}
const roster = (count: number, sessions?: number) => (message: ServerMessage) =>
  message.type === 'presence' &&
  message.users.length === count &&
  (sessions === undefined ||
    message.users.reduce((sum, user) => sum + user.sessions, 0) === sessions);
afterEach(async () => {
  await Promise.all(
    sockets.splice(0).map(
      (ws) =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) {
            resolve();
            return;
          }
          ws.addEventListener('close', () => resolve(), { once: true });
          ws.close();
        }),
    ),
  );
  for (const instance of apps.splice(0)) await instance.stop();
});

describe('authenticated native WebSockets', () => {
  test('two authorized identities receive broadcasts; leave and disconnect clean the roster', async () => {
    const instance = app();
    const first = client(instance);
    const second = client(instance, 'guest');
    await first.next((m) => m.type === 'ready');
    await second.next((m) => m.type === 'ready');
    first.send({ type: 'join', documentId: 1 });
    await first.next(roster(1));
    second.send({ type: 'join', documentId: 1 });
    await first.next(roster(2));
    await second.next(roster(2));
    second.send({ type: 'leave' });
    await first.next(roster(1));
    second.send({ type: 'join', documentId: 1 });
    await first.next(roster(2));
    second.ws.close();
    await first.next(roster(1));
    first.send({ type: 'ping' });
    await first.next((m) => m.type === 'pong');
  });
  test('deduplicates a user across sessions and repeated joins', async () => {
    const instance = app();
    const first = client(instance);
    const second = client(instance);
    await first.next((m) => m.type === 'ready');
    await second.next((m) => m.type === 'ready');
    first.send({ type: 'join', documentId: 1 });
    await first.next(roster(1, 1));
    second.send({ type: 'join', documentId: 1 });
    await first.next(roster(1, 2));
    second.send({ type: 'join', documentId: 1 });
    await second.next(roster(1, 2));
    second.ws.close();
    await first.next(roster(1, 1));
  });
  test('rejects missing/invalid credentials and foreign or missing origins before upgrade', async () => {
    const instance = app();
    for (const headers of [
      { Origin: origin },
      { Origin: origin, Cookie: 'marksync_session=bad' },
      { Origin: 'https://evil.example', Cookie: 'marksync_session=owner' },
      { Cookie: 'marksync_session=owner' },
    ] as Record<string, string>[]) {
      const response = await fetch(`http://localhost:${instance.server.port}/ws`, { headers });
      expect([401, 403]).toContain(response.status);
    }
    const bad = client(instance, 'bad');
    await new Promise<void>((resolve) => bad.ws.addEventListener('close', () => resolve()));
    expect(bad.ws.readyState).toBe(WebSocket.CLOSED);
  });
  test('rejects another owner’s document and missing documents without presence', async () => {
    for (const id of [2, 999]) {
      const guest = client(app(), 'guest');
      await guest.next((m) => m.type === 'ready');
      guest.send({ type: 'join', documentId: id });
      expect(await guest.next((m) => m.type === 'error')).toMatchObject({
        code: 'DOCUMENT_UNAVAILABLE',
      });
    }
  });
  test('rejects malformed messages and clears presence', async () => {
    const instance = app();
    const first = client(instance);
    const second = client(instance);
    await first.next((m) => m.type === 'ready');
    await second.next((m) => m.type === 'ready');
    first.send({ type: 'join', documentId: 1 });
    await first.next(roster(1, 1));
    second.send({ type: 'join', documentId: 1 });
    await first.next(roster(1, 2));
    second.ws.send('{broken');
    await second.next((m) => m.type === 'error');
    await first.next(roster(1, 1));
  });
  test('expires stale connections', async () => {
    const idle = client(app({ sweepMs: 10, idleMs: 30 }));
    await idle.next((m) => m.type === 'ready');
    await idle.next((m) => m.type === 'error' && m.code === 'UNAUTHORIZED');
  });
  test('rechecks expired credentials and deleted documents on established sockets', async () => {
    for (const revoke of ['auth', 'document']) {
      let active = true;
      const instance = app({
        sweepMs: 20,
        access: {
          authenticate: (token) =>
            active || revoke !== 'auth' ? access.authenticate(token) : Promise.resolve(null),
          canAccess: (token, id) =>
            active || revoke !== 'document' ? access.canAccess(token, id) : Promise.resolve(false),
        },
      });
      const peer = client(instance);
      await peer.next((m) => m.type === 'ready');
      peer.send({ type: 'join', documentId: 1 });
      await peer.next(roster(1));
      active = false;
      expect(await peer.next((m) => m.type === 'error')).toMatchObject({
        code: revoke === 'auth' ? 'UNAUTHORIZED' : 'DOCUMENT_UNAVAILABLE',
      });
    }
  });
  test('a disconnect during authorization cannot recreate ghost presence', async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const instance = app({ access: { ...access, canAccess: () => pending } });
    const first = client(instance);
    await first.next((m) => m.type === 'ready');
    first.send({ type: 'join', documentId: 1 });
    first.ws.close();
    release(true);
    const second = client(instance);
    await second.next((m) => m.type === 'ready');
    second.send({ type: 'join', documentId: 1 });
    await second.next(roster(1, 1));
  });
});

test('validates the complete message shape', () => {
  for (const data of [
    null,
    [],
    {},
    { type: 'join', documentId: -1 },
    { type: 'join', documentId: '1' },
    { type: 'join', documentId: 1.5 },
    { type: 'ping', token: 'secret' },
    { type: 'unknown' },
  ])
    expect(parseMessage(JSON.stringify(data))).toBeNull();
  expect(parseMessage('x'.repeat(1025))).toBeNull();
  expect(parseMessage('{')).toBeNull();
});

test('upstream authorization forwards credentials only in headers and fails closed', async () => {
  const upstream = Bun.serve({
    port: 0,
    fetch(request) {
      expect(request.headers.get('authorization')).toBe('Bearer private');
      expect(new URL(request.url).search).toBe('');
      if (new URL(request.url).pathname === '/auth/me')
        return Response.json({ id: 1, email: 'owner@example.com' });
      return new Response(null, { status: 404 });
    },
  });
  try {
    const adapter = upstreamAccess(upstream.url.origin, upstream.url.origin);
    expect(await adapter.authenticate('private')).toMatchObject({ id: 1 });
    expect(await adapter.canAccess('private', 1)).toBe(false);
  } finally {
    await upstream.stop(true);
  }
});

test('shutdown closes active clients and stops accepting connections', async () => {
  const instance = app();
  const peer = client(instance);
  await peer.next((message) => message.type === 'ready');
  const closed = new Promise<void>((resolve) =>
    peer.ws.addEventListener('close', () => resolve(), { once: true }),
  );
  instance.stop();
  await closed;
  expect(peer.ws.readyState).toBe(WebSocket.CLOSED);
  await expect(fetch(`http://localhost:${instance.server.port}/health`)).rejects.toThrow();
});
