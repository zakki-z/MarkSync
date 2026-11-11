import { afterEach, describe, expect, jest, test } from 'bun:test';
import { createApp } from '../src/app';
import { CloseCode, ErrorCode } from '../src/protocol';
import { connect, FakeAccess, join } from './support';

const apps: ReturnType<typeof createApp>[] = [];
function setup(access = new FakeAccess(), revalidateMs = 1000) {
  const app = createApp({ access, revalidateMs });
  apps.push(app);
  return { app, access };
}
afterEach(() => {
  for (const app of apps.splice(0)) app.stop();
  jest.useRealTimers();
});
const ids = (users?: { id: number }[]) => users?.map((user) => user.id);

describe('revalidation of joined rooms', () => {
  test('a member removed while connected is evicted, told why, and the others are notified', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1, 2]);

    access.set('token2', 7, 'denied');
    await app.revalidator.sweep();

    expect(bob.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.Forbidden,
      workspaceId: 7,
    });
    expect(bob.transport.closed?.code).toBe(CloseCode.Forbidden);
    expect(bob.connection.rooms.size).toBe(0);
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    expect(ada.transport.closed).toBeUndefined();
  });

  test('members who still have access are left alone', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    const frames = ada.transport.frames.length;
    await app.revalidator.sweep();
    expect(ada.transport.frames).toHaveLength(frames);
    expect([...ada.connection.rooms]).toEqual([7]);
  });

  test('asks once per token and workspace, however many tabs share them', async () => {
    const { app, access } = setup();
    const tabA = connect(app, 1);
    const tabB = connect(app, 1);
    const other = connect(app, 2);
    for (const { connection } of [tabA, tabB, other])
      await app.dispatcher.dispatch(connection, join(7));
    access.calls.length = 0;
    await app.revalidator.sweep();
    expect(access.calls.sort()).toEqual(['token1:7', 'token2:7']);
  });

  test('a revoked workspace only removes the connection from that room', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(ada.connection, join(8));
    access.set('token1', 8, 'denied');
    await app.revalidator.sweep();
    expect([...ada.connection.rooms]).toEqual([7]);
    expect(ada.transport.closed).toBeUndefined();
  });

  test('an expired token closes the connection with 4401', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    access.set('token1', 7, 'unauthenticated');
    await app.revalidator.sweep();
    expect(ada.transport.closed?.code).toBe(CloseCode.Unauthenticated);
  });

  test('fails closed when the workspace service is down, so the client can retry later', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    access.check = (token) =>
      token === 'token2' ? Promise.reject(new Error('down')) : Promise.resolve('granted');
    await app.revalidator.sweep();
    expect(bob.transport.closed?.code).toBe(CloseCode.TryAgainLater);
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
  });

  test('a removed member cannot get back in until the workspace service allows it', async () => {
    const { app, access } = setup();
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(bob.connection, join(7));
    access.set('token2', 7, 'denied');
    await app.revalidator.sweep();
    const again = connect(app, 2);
    await app.dispatcher.dispatch(again.connection, join(7));
    expect(again.connection.rooms.size).toBe(0);
    access.set('token2', 7, 'granted');
    const reconnected = connect(app, 2);
    await app.dispatcher.dispatch(reconnected.connection, join(7));
    expect([...reconnected.connection.rooms]).toEqual([7]);
  });

  test('a connection that left or closed while the answer was pending is not touched', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    access.set('token1', 7, 'denied');
    let release!: () => void;
    access.gate = new Promise<void>((resolve) => (release = resolve));
    const sweeping = app.revalidator.sweep();
    app.connections.close(ada.connection, CloseCode.ServiceRestart, 'bye');
    release();
    await sweeping;
    expect(ada.transport.of('error')).toHaveLength(0);
    expect(ada.transport.closed?.code).toBe(CloseCode.ServiceRestart);
  });

  test('overlapping sweeps are skipped instead of piling up', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    access.calls.length = 0;
    let release!: () => void;
    access.gate = new Promise<void>((resolve) => (release = resolve));
    const first = app.revalidator.sweep();
    await app.revalidator.sweep();
    release();
    await first;
    expect(access.calls).toEqual(['token1:7']);
  });
});

describe('revalidation timer', () => {
  test('sweeps every interval after start and stops with the app', async () => {
    jest.useFakeTimers();
    const { app, access } = setup(new FakeAccess(), 1000);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(bob.connection, join(7));
    access.set('token2', 7, 'denied');
    app.start();
    jest.advanceTimersByTime(999);
    expect(bob.transport.closed).toBeUndefined();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(bob.transport.closed?.code).toBe(CloseCode.Forbidden);
    app.stop();
    expect(jest.getTimerCount()).toBe(0);
  });
});
