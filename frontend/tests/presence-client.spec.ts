import { expect, test } from '@playwright/test';
import { HEARTBEAT_INTERVAL_MS } from '../src/presence/protocol';
import {
  WorkspacePresenceClient,
  type PresenceSocket,
  type Scheduler,
} from '../src/presence/WorkspacePresenceClient';

const WORKSPACE = 7;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket implements PresenceSocket {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closedWith?: number;
  onopen: PresenceSocket['onopen'] = null;
  onmessage: PresenceSocket['onmessage'] = null;
  onclose: PresenceSocket['onclose'] = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number) {
    this.readyState = CLOSED;
    this.closedWith = code;
  }
  open() {
    this.readyState = OPEN;
    this.onopen?.(new Event('open'));
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }
  serverClose(code: number) {
    this.readyState = CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
  types() {
    return this.sent.map((message) => message.type);
  }
}

/** Time only moves when the test says so. */
class ManualScheduler implements Scheduler {
  private now = 0;
  private tasks = new Map<number, { due: number; every?: number; run: () => void }>();
  private nextId = 1;
  delays: number[] = [];

  after(ms: number, run: () => void) {
    this.delays.push(ms);
    return this.add({ due: this.now + ms, run });
  }
  every(ms: number, run: () => void) {
    return this.add({ due: this.now + ms, every: ms, run });
  }
  get pending() {
    return this.tasks.size;
  }
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= end)
        .sort(([, a], [, b]) => a.due - b.due)[0];
      if (!next) break;
      const [id, task] = next;
      this.now = task.due;
      if (task.every) task.due += task.every;
      else this.tasks.delete(id);
      task.run();
    }
    this.now = end;
  }
  private add(task: { due: number; every?: number; run: () => void }) {
    const id = this.nextId++;
    this.tasks.set(id, task);
    return () => {
      this.tasks.delete(id);
    };
  }
}

function setup(random = () => 1) {
  const scheduler = new ManualScheduler();
  const sockets: FakeSocket[] = [];
  const expired: string[] = [];
  const client = new WorkspacePresenceClient({
    workspaceId: WORKSPACE,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    scheduler,
    random,
    onSessionExpired: () => expired.push('expired'),
  });
  const presence = (...ids: number[]) => ({
    type: 'presence',
    workspaceId: WORKSPACE,
    users: ids.map((id) => ({ id, displayName: `user${id}` })),
  });
  const last = () => sockets[sockets.length - 1]!;
  return { client, scheduler, sockets, expired, presence, last };
}

test.describe('WorkspacePresenceClient', () => {
  test('joins on open and shows the server presence once it arrives', () => {
    const { client, presence, last } = setup();
    client.start();
    expect(client.getSnapshot().status).toBe('connecting');
    last().open();
    expect(last().sent).toEqual([{ type: 'join', workspaceId: WORKSPACE }]);
    last().receive(presence(1, 2));
    expect(client.getSnapshot()).toMatchObject({
      status: 'connected',
      users: [
        { id: 1, displayName: 'user1' },
        { id: 2, displayName: 'user2' },
      ],
    });
  });

  test('sends a heartbeat every interval and keeps going while the server answers', () => {
    const { client, scheduler, presence, last } = setup();
    client.start();
    last().open();
    last().receive(presence(1));
    for (let i = 0; i < 10; i++) {
      scheduler.advance(HEARTBEAT_INTERVAL_MS);
      last().receive({ type: 'heartbeat' });
    }
    expect(last().sent.filter((message) => message.type === 'heartbeat')).toHaveLength(10);
    expect(client.getSnapshot().status).toBe('connected');
  });

  test('reconnects after a dropped connection and joins the workspace again', () => {
    const { client, scheduler, sockets, presence, last } = setup();
    client.start();
    last().open();
    last().receive(presence(1, 2));
    last().serverClose(1006);
    expect(client.getSnapshot()).toMatchObject({ status: 'reconnecting', users: [] });
    expect(sockets).toHaveLength(1);

    scheduler.advance(1000);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().sent).toEqual([{ type: 'join', workspaceId: WORKSPACE }]);
    last().receive(presence(1, 2));
    expect(client.getSnapshot().status).toBe('connected');
  });

  test('backs off exponentially with jitter, up to a cap, and resets after a successful join', () => {
    const { client, scheduler, sockets, presence, last } = setup(() => 1);
    client.start();
    for (let attempt = 0; attempt < 7; attempt++) {
      last().serverClose(1006);
      scheduler.advance(30_000);
    }
    expect(scheduler.delays).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]);

    last().open();
    last().receive(presence(1));
    last().serverClose(1006);
    expect(scheduler.delays.at(-1)).toBe(1000);
    expect(sockets.length).toBeGreaterThan(7);
  });

  test('jitter spreads each delay between half the ceiling and the ceiling', () => {
    const low = setup(() => 0);
    low.client.start();
    low.last().serverClose(1006);
    expect(low.scheduler.delays).toEqual([500]);

    const high = setup(() => 0.5);
    high.client.start();
    high.last().serverClose(1006);
    expect(high.scheduler.delays).toEqual([750]);
  });

  test('does not reconnect when the session expired (4401) and tells the app', () => {
    const { client, scheduler, sockets, expired, last } = setup();
    client.start();
    last().open();
    last().serverClose(4401);
    scheduler.advance(120_000);
    expect(client.getSnapshot().status).toBe('disconnected');
    expect(sockets).toHaveLength(1);
    expect(expired).toEqual(['expired']);
    expect(scheduler.pending).toBe(0);
  });

  test('does not reconnect when access was revoked (4403)', () => {
    const { client, scheduler, sockets, presence, last } = setup();
    client.start();
    last().open();
    last().receive(presence(1, 2));
    last().serverClose(4403);
    scheduler.advance(120_000);
    expect(client.getSnapshot()).toMatchObject({ status: 'revoked', users: [] });
    expect(sockets).toHaveLength(1);
    expect(scheduler.pending).toBe(0);
  });

  test('a forbidden error from the server ends the connection without reconnecting', () => {
    const { client, scheduler, sockets, presence, last } = setup();
    client.start();
    last().open();
    last().receive(presence(1));
    last().receive({ type: 'error', code: 'FORBIDDEN', message: 'no', workspaceId: WORKSPACE });
    expect(client.getSnapshot().status).toBe('revoked');
    last().serverClose(4403);
    scheduler.advance(120_000);
    expect(sockets).toHaveLength(1);
  });

  test('a service-unavailable error is retried like a lost connection', () => {
    const { client, scheduler, sockets, last } = setup();
    client.start();
    last().open();
    last().receive({ type: 'error', code: 'UNAVAILABLE', message: 'later' });
    expect(client.getSnapshot().status).toBe('reconnecting');
    scheduler.advance(1000);
    expect(sockets).toHaveLength(2);
  });

  test('presumes a silent server dead after unanswered heartbeats, even without a close event', () => {
    const { client, scheduler, sockets, presence, last } = setup();
    client.start();
    const first = last();
    first.open();
    first.receive(presence(1));
    scheduler.advance(3 * HEARTBEAT_INTERVAL_MS);
    expect(client.getSnapshot().status).toBe('connected');
    scheduler.advance(HEARTBEAT_INTERVAL_MS);
    expect(client.getSnapshot().status).toBe('reconnecting');
    expect(first.closedWith).toBe(1000);
    scheduler.advance(1000);
    expect(sockets).toHaveLength(2);
    last().open();
    expect(last().types()).toEqual(['join']);
  });

  test('ignores frames for other workspaces and malformed frames', () => {
    const { client, last } = setup();
    client.start();
    last().open();
    last().receive({ type: 'presence', workspaceId: 99, users: [{ id: 5, displayName: 'x' }] });
    last().onmessage?.({ data: '{nope' } as MessageEvent);
    last().receive({
      type: 'presence',
      workspaceId: WORKSPACE,
      users: [{ id: 5, email: 'a@b.c' }],
    });
    expect(client.getSnapshot()).toMatchObject({ status: 'connecting', users: [] });
  });

  test('collects messages from the server and sends only when connected', () => {
    const { client, presence, last } = setup();
    client.start();
    last().open();
    expect(client.send('too early')).toBe(false);
    last().receive(presence(1, 2));
    expect(client.send('hello')).toBe(true);
    expect(last().sent.at(-1)).toEqual({ type: 'message', workspaceId: WORKSPACE, text: 'hello' });
    last().receive({
      type: 'message',
      workspaceId: WORKSPACE,
      sender: { id: 2, displayName: 'user2' },
      text: 'hi back',
      sentAt: '2026-11-11T10:00:00.000Z',
    });
    expect(client.getSnapshot().messages).toEqual([
      {
        id: 1,
        sender: { id: 2, displayName: 'user2' },
        text: 'hi back',
        sentAt: '2026-11-11T10:00:00.000Z',
      },
    ]);
    last().serverClose(1006);
    expect(client.send('while offline')).toBe(false);
    expect(client.getSnapshot().messages).toHaveLength(1);
  });

  test('notifies subscribers with a new snapshot for each change', () => {
    const { client, presence, last } = setup();
    const seen: unknown[] = [];
    const unsubscribe = client.subscribe(() => seen.push(client.getSnapshot()));
    client.start();
    last().open();
    last().receive(presence(1));
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toBe(client.getSnapshot().users);
    unsubscribe();
    last().receive(presence(1, 2));
    expect(seen).toHaveLength(1);
  });

  test('dispose leaves the room, closes the socket, stops every timer and silences old sockets', () => {
    const { client, scheduler, sockets, presence, last } = setup();
    client.start();
    const socket = last();
    socket.open();
    socket.receive(presence(1));
    client.dispose();
    expect(socket.sent.at(-1)).toEqual({ type: 'leave', workspaceId: WORKSPACE });
    expect(socket.closedWith).toBe(1000);
    expect(scheduler.pending).toBe(0);
    socket.onclose?.({ code: 1006 } as CloseEvent);
    scheduler.advance(120_000);
    expect(sockets).toHaveLength(1);
    client.dispose();
  });

  test('dispose while a reconnect is pending cancels it', () => {
    const { client, scheduler, sockets, last } = setup();
    client.start();
    last().serverClose(1006);
    client.dispose();
    scheduler.advance(120_000);
    expect(sockets).toHaveLength(1);
    expect(scheduler.pending).toBe(0);
  });
});
