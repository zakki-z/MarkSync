import { afterEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { AuthServiceAuthenticator } from '../src/connection-authenticator';
import { CloseCode, ErrorCode, type ServerMessage } from '../src/protocol';
import { startServer } from '../src/server';
import { HttpWorkspaceAccessChecker } from '../src/workspace-access';

const origin = 'http://localhost:8080';
const WORKSPACE = 7;

/** Stands in for the auth and workspace services; membership can change while sockets are open. */
const accounts: Record<string, { id: number; username: string }> = {
  'token-ada': { id: 1, username: 'ada' },
  'token-bob': { id: 2, username: 'bob' },
  'token-eve': { id: 3, username: 'eve' },
};
const members = new Set<string>();
let authDown = false;
let workspaceDown = false;
const upstream = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    const account = accounts[request.headers.get('authorization')?.slice(7) ?? ''];
    if (!account) return new Response(null, { status: 401 });
    if (pathname === '/auth/me')
      return authDown
        ? new Response(null, { status: 503 })
        : Response.json({ ...account, email: `${account.username}@example.com`, role: 'user' });
    const match = pathname.match(/^\/api\/workspaces\/(\d+)\/membership$/);
    if (!match) return new Response(null, { status: 404 });
    if (workspaceDown) return new Response(null, { status: 503 });
    return members.has(`${account.id}:${match[1]}`)
      ? Response.json({ role: 'EDITOR', canEdit: true })
      : new Response(null, { status: 404 });
  },
});

type Running = ReturnType<typeof startServer>;
const running: Running[] = [];
const sockets: WebSocket[] = [];
const state = { now: 1_000_000 };

function start() {
  const app = createApp({
    access: new HttpWorkspaceAccessChecker(upstream.url.origin, 1000),
    heartbeat: { intervalMs: 1000, maxMissed: 3 },
    clock: () => state.now,
  });
  const instance = startServer({
    port: 0,
    origins: [origin],
    authenticator: new AuthServiceAuthenticator(upstream.url.origin, 1000),
    app,
  });
  running.push(instance);
  return { app, port: instance.server.port };
}

function client(port: number | undefined, token: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, {
    headers: { Origin: origin, Cookie: `marksync_session=${token}` },
  });
  sockets.push(ws);
  const frames: ServerMessage[] = [];
  const waiters = new Set<() => void>();
  ws.addEventListener('message', (event) => {
    frames.push(JSON.parse(String(event.data)));
    for (const wake of waiters) wake();
  });
  const closed = new Promise<number>((resolve) =>
    ws.addEventListener('close', (event) => resolve(event.code), { once: true }),
  );
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('socket refused')), { once: true });
  });
  /** Resolves with the first not yet consumed frame matching the predicate. */
  function next<T extends ServerMessage>(
    predicate: (frame: ServerMessage) => frame is T,
  ): Promise<T>;
  function next(predicate: (frame: ServerMessage) => boolean): Promise<ServerMessage>;
  function next(predicate: (frame: ServerMessage) => boolean) {
    return new Promise<ServerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error('Expected WebSocket frame'));
      }, 2000);
      function check() {
        const index = frames.findIndex(predicate);
        if (index < 0) return;
        const [frame] = frames.splice(index, 1);
        clearTimeout(timer);
        waiters.delete(check);
        resolve(frame!);
      }
      waiters.add(check);
      check();
    });
  }
  const send = (message: unknown) => ws.send(JSON.stringify(message));
  return { ws, opened, closed, next, send, frames };
}

const presenceOf =
  (...names: string[]) =>
  (frame: ServerMessage): frame is Extract<ServerMessage, { type: 'presence' }> =>
    frame.type === 'presence' &&
    frame.users.map((user) => user.displayName).join(',') === names.join(',');
const isError = (frame: ServerMessage): frame is Extract<ServerMessage, { type: 'error' }> =>
  frame.type === 'error';
const isMessage = (frame: ServerMessage): frame is Extract<ServerMessage, { type: 'message' }> =>
  frame.type === 'message';

afterEach(async () => {
  authDown = workspaceDown = false;
  members.clear();
  await Promise.all(
    sockets.splice(0).map(
      (ws) =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) return resolve();
          ws.addEventListener('close', () => resolve(), { once: true });
          ws.close();
        }),
    ),
  );
  for (const instance of running.splice(0)) instance.stop();
});
process.on('exit', () => void upstream.stop(true));

describe('two authorized users in one workspace', () => {
  test('see each other online, exchange messages both ways, and a revoked member is removed', async () => {
    members.add(`1:${WORKSPACE}`).add(`2:${WORKSPACE}`);
    const { app, port } = start();
    const ada = client(port, 'token-ada');
    const bob = client(port, 'token-bob');
    await Promise.all([ada.opened, bob.opened]);

    ada.send({ type: 'join', workspaceId: WORKSPACE });
    await ada.next(presenceOf('ada'));
    bob.send({ type: 'join', workspaceId: WORKSPACE });
    const [seenByAda, seenByBob] = await Promise.all([
      ada.next(presenceOf('ada', 'bob')),
      bob.next(presenceOf('ada', 'bob')),
    ]);
    expect(seenByAda.users).toEqual([
      { id: 1, displayName: 'ada' },
      { id: 2, displayName: 'bob' },
    ]);
    expect(seenByBob.users).toEqual(seenByAda.users);

    ada.send({ type: 'message', workspaceId: WORKSPACE, text: 'hello bob' });
    await ada.next(isMessage);
    expect(await bob.next(isMessage)).toMatchObject({
      workspaceId: WORKSPACE,
      sender: { id: 1, displayName: 'ada' },
      text: 'hello bob',
    });
    bob.send({ type: 'message', workspaceId: WORKSPACE, text: 'hi ada' });
    expect(await ada.next(isMessage)).toMatchObject({
      text: 'hi ada',
      sender: { id: 2, displayName: 'bob' },
    });
    await bob.next(isMessage);

    members.delete(`2:${WORKSPACE}`);
    await app.revalidator.sweep();
    expect(await bob.next(isError)).toMatchObject({
      code: ErrorCode.Forbidden,
      workspaceId: WORKSPACE,
    });
    expect(await bob.closed).toBe(CloseCode.Forbidden);
    await ada.next(presenceOf('ada'));

    ada.send({ type: 'message', workspaceId: WORKSPACE, text: 'anyone there?' });
    expect(await ada.next(isMessage)).toMatchObject({ text: 'anyone there?' });
    expect(bob.frames.filter(isMessage)).toHaveLength(0);
  });

  test('frames never carry emails or tokens', async () => {
    members.add(`1:${WORKSPACE}`).add(`2:${WORKSPACE}`);
    const { port } = start();
    const ada = client(port, 'token-ada');
    const bob = client(port, 'token-bob');
    await Promise.all([ada.opened, bob.opened]);
    ada.send({ type: 'join', workspaceId: WORKSPACE });
    bob.send({ type: 'join', workspaceId: WORKSPACE });
    await bob.next(presenceOf('ada', 'bob'));
    bob.send({ type: 'message', workspaceId: WORKSPACE, text: 'x' });
    await ada.next(isMessage);
    const everything = JSON.stringify([...ada.frames, ...bob.frames]);
    expect(everything).not.toContain('example.com');
    expect(everything).not.toContain('token-');
  });

  test('a user with two tabs stays online until the last tab closes', async () => {
    members.add(`1:${WORKSPACE}`).add(`2:${WORKSPACE}`);
    const { port } = start();
    const observer = client(port, 'token-bob');
    const tabA = client(port, 'token-ada');
    const tabB = client(port, 'token-ada');
    await Promise.all([observer.opened, tabA.opened, tabB.opened]);
    for (const peer of [observer, tabA, tabB]) peer.send({ type: 'join', workspaceId: WORKSPACE });
    await observer.next(presenceOf('ada', 'bob'));
    observer.frames.length = 0;
    tabA.ws.close();
    await tabA.closed;
    tabB.send({ type: 'message', workspaceId: WORKSPACE, text: 'still here' });
    await observer.next((f) => isMessage(f) && f.text === 'still here');
    expect(observer.frames.filter(presenceOf('bob'))).toHaveLength(0);
    tabB.ws.close();
    await observer.next(presenceOf('bob'));
  });
});

describe('who may join and send', () => {
  test('a non-member is rejected, never listed, and receives nothing', async () => {
    members.add(`1:${WORKSPACE}`);
    const { port } = start();
    const ada = client(port, 'token-ada');
    const eve = client(port, 'token-eve');
    await Promise.all([ada.opened, eve.opened]);
    ada.send({ type: 'join', workspaceId: WORKSPACE });
    await ada.next(presenceOf('ada'));
    eve.send({ type: 'join', workspaceId: WORKSPACE });
    expect(await eve.next(isError)).toMatchObject({ code: ErrorCode.Forbidden });
    expect(await eve.closed).toBe(CloseCode.Forbidden);
    ada.send({ type: 'message', workspaceId: WORKSPACE, text: 'secret' });
    await ada.next(isMessage);
    expect(eve.frames.filter(isMessage)).toHaveLength(0);
    expect(ada.frames.filter(presenceOf('ada', 'eve'))).toHaveLength(0);
  });

  test('a sender must have joined the room it sends to', async () => {
    members.add(`1:${WORKSPACE}`).add(`2:${WORKSPACE}`);
    const { port } = start();
    const ada = client(port, 'token-ada');
    const bob = client(port, 'token-bob');
    await Promise.all([ada.opened, bob.opened]);
    ada.send({ type: 'join', workspaceId: WORKSPACE });
    await ada.next(presenceOf('ada'));
    bob.send({ type: 'message', workspaceId: WORKSPACE, text: 'let me in' });
    expect(await bob.next(isError)).toMatchObject({
      code: ErrorCode.NotJoined,
      workspaceId: WORKSPACE,
    });
    bob.send({ type: 'join', workspaceId: WORKSPACE });
    await bob.next(presenceOf('ada', 'bob'));
    bob.send({ type: 'leave', workspaceId: WORKSPACE });
    await ada.next(presenceOf('ada'));
    bob.send({ type: 'message', workspaceId: WORKSPACE, text: 'after leaving' });
    expect(await bob.next(isError)).toMatchObject({ code: ErrorCode.NotJoined });
    expect(ada.frames.filter(isMessage)).toHaveLength(0);
  });

  test('a workspace id from a message is checked, not trusted', async () => {
    members.add(`1:${WORKSPACE}`);
    const { port } = start();
    const ada = client(port, 'token-ada');
    await ada.opened;
    ada.send({ type: 'join', workspaceId: 999 });
    expect(await ada.next(isError)).toMatchObject({ code: ErrorCode.Forbidden, workspaceId: 999 });
    expect(await ada.closed).toBe(CloseCode.Forbidden);
  });

  test('an unavailable workspace service fails closed with a retryable close', async () => {
    members.add(`1:${WORKSPACE}`);
    workspaceDown = true;
    const { port } = start();
    const ada = client(port, 'token-ada');
    await ada.opened;
    ada.send({ type: 'join', workspaceId: WORKSPACE });
    expect(await ada.next(isError)).toMatchObject({ code: ErrorCode.Unavailable });
    expect(await ada.closed).toBe(CloseCode.TryAgainLater);
  });
});

describe('the handshake', () => {
  test('refuses missing or invalid credentials and foreign origins before any upgrade', async () => {
    const { port } = start();
    for (const [headers, status] of [
      [{ Origin: origin }, 401],
      [{ Origin: origin, Cookie: 'marksync_session=nope' }, 401],
      [{ Origin: 'https://evil.example', Cookie: 'marksync_session=token-ada' }, 403],
      [{ Cookie: 'marksync_session=token-ada' }, 403],
    ] as [Record<string, string>, number][]) {
      const response = await fetch(`http://localhost:${port}/ws`, { headers });
      expect(response.status).toBe(status);
    }
    const bad = client(port, 'nope');
    await expect(bad.opened).rejects.toThrow();
    expect(await bad.closed).not.toBe(1000);
  });

  test('answers 503 rather than letting anyone in when the auth service is down', async () => {
    authDown = true;
    const { port } = start();
    const response = await fetch(`http://localhost:${port}/ws`, {
      headers: { Origin: origin, Cookie: 'marksync_session=token-ada' },
    });
    expect(response.status).toBe(503);
  });

  test('serves a public health check', async () => {
    const { port } = start();
    expect(await (await fetch(`http://localhost:${port}/health`)).json()).toEqual({ status: 'ok' });
  });
});

describe('connection health', () => {
  test('a heartbeat is acknowledged', async () => {
    const { port } = start();
    const ada = client(port, 'token-ada');
    await ada.opened;
    ada.send({ type: 'heartbeat' });
    expect(await ada.next((f) => f.type === 'heartbeat')).toEqual({ type: 'heartbeat' });
  });

  test('malformed frames are answered and the connection keeps working', async () => {
    const { port } = start();
    const ada = client(port, 'token-ada');
    await ada.opened;
    ada.ws.send('{nope');
    ada.ws.send(JSON.stringify({ type: 'join', workspaceId: 'seven' }));
    ada.ws.send(new Uint8Array([1, 2, 3]));
    for (let i = 0; i < 3; i++)
      expect(await ada.next(isError)).toMatchObject({ code: ErrorCode.InvalidMessage });
    ada.send({ type: 'heartbeat' });
    await ada.next((f) => f.type === 'heartbeat');
    expect(ada.ws.readyState).toBe(WebSocket.OPEN);
  });

  test('a client that goes silent is dropped and the others see it leave', async () => {
    members.add(`1:${WORKSPACE}`).add(`2:${WORKSPACE}`);
    const { app, port } = start();
    const ada = client(port, 'token-ada');
    const bob = client(port, 'token-bob');
    await Promise.all([ada.opened, bob.opened]);
    ada.send({ type: 'join', workspaceId: WORKSPACE });
    bob.send({ type: 'join', workspaceId: WORKSPACE });
    await ada.next(presenceOf('ada', 'bob'));
    state.now += 3500;
    ada.send({ type: 'heartbeat' });
    await ada.next((f) => f.type === 'heartbeat');
    app.monitor.sweep();
    expect(await bob.closed).toBe(CloseCode.HeartbeatTimeout);
    await ada.next(presenceOf('ada'));
  });

  test('shutdown closes clients with 1012 and refuses new connections', async () => {
    const instance = start();
    const ada = client(instance.port, 'token-ada');
    await ada.opened;
    running[0]!.stop();
    expect(await ada.closed).toBe(CloseCode.ServiceRestart);
    await expect(fetch(`http://localhost:${instance.port}/health`)).rejects.toThrow();
  });
});
