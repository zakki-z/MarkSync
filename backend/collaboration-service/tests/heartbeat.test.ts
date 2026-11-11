import { afterEach, describe, expect, jest, test } from 'bun:test';
import { createApp } from '../src/app';
import { CloseCode } from '../src/protocol';
import { connect, FakeAccess, join } from './support';

const heartbeat = JSON.stringify({ type: 'heartbeat' });
const INTERVAL = 1000;
const apps: ReturnType<typeof createApp>[] = [];

function setup(maxMissed = 3) {
  const state = { now: 10_000 };
  const app = createApp({
    access: new FakeAccess(),
    heartbeat: { intervalMs: INTERVAL, maxMissed },
    clock: () => state.now,
  });
  apps.push(app);
  return { app, state };
}
afterEach(() => {
  for (const app of apps.splice(0)) app.stop();
  jest.useRealTimers();
});

describe('heartbeat handling', () => {
  test('a heartbeat is acknowledged and keeps the connection alive', async () => {
    const { app, state } = setup();
    const ada = connect(app, 1);
    state.now += 2.5 * INTERVAL;
    await app.dispatcher.dispatch(ada.connection, heartbeat);
    expect(ada.transport.frames).toEqual([{ type: 'heartbeat' }]);
    state.now += 2.5 * INTERVAL;
    app.monitor.sweep();
    expect(ada.transport.closed).toBeUndefined();
  });
});

describe('HeartbeatMonitor.sweep', () => {
  test('drops a connection after more than N silent intervals and updates presence', async () => {
    const { app, state } = setup(3);
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));

    state.now += 3 * INTERVAL;
    await app.dispatcher.dispatch(ada.connection, heartbeat);
    app.monitor.sweep();
    expect(bob.transport.closed).toBeUndefined();

    state.now += 1;
    app.monitor.sweep();
    expect(bob.transport.closed?.code).toBe(CloseCode.HeartbeatTimeout);
    expect(bob.connection.rooms.size).toBe(0);
    expect(ada.transport.closed).toBeUndefined();
    expect(ada.transport.lastPresence?.users.map((user) => user.id)).toEqual([1]);
  });

  test('also drops connections that never joined a room', () => {
    const { app, state } = setup(2);
    const idle = connect(app, 1);
    state.now += 2 * INTERVAL + 1;
    app.monitor.sweep();
    expect(idle.transport.closed?.code).toBe(CloseCode.HeartbeatTimeout);
    expect(app.connections.all()).toEqual([]);
  });

  test('any frame counts as activity, even a malformed one', async () => {
    const { app, state } = setup(2);
    const ada = connect(app, 1);
    state.now += 2 * INTERVAL;
    await app.dispatcher.dispatch(ada.connection, '{broken');
    state.now += 2 * INTERVAL;
    app.monitor.sweep();
    expect(ada.transport.closed).toBeUndefined();
  });

  test('a user with another live tab stays online when one tab times out', async () => {
    const { app, state } = setup(2);
    const silent = connect(app, 1);
    const live = connect(app, 1);
    const observer = connect(app, 2);
    for (const { connection } of [silent, live, observer])
      await app.dispatcher.dispatch(connection, join(7));
    state.now += 2 * INTERVAL + 1;
    await app.dispatcher.dispatch(live.connection, heartbeat);
    await app.dispatcher.dispatch(observer.connection, heartbeat);
    app.monitor.sweep();
    expect(silent.transport.closed?.code).toBe(CloseCode.HeartbeatTimeout);
    expect(observer.transport.lastPresence?.users.map((user) => user.id)).toEqual([1, 2]);
  });
});

describe('lifecycle with fake timers', () => {
  test('start sweeps every interval until stop', () => {
    jest.useFakeTimers();
    const state = { now: 0 };
    const app = createApp({
      access: new FakeAccess(),
      heartbeat: { intervalMs: INTERVAL, maxMissed: 2 },
      clock: () => state.now,
    });
    apps.push(app);
    const silent = connect(app, 1);
    app.start();
    app.start();
    state.now = 2 * INTERVAL + 1;
    jest.advanceTimersByTime(INTERVAL - 1);
    expect(silent.transport.closed).toBeUndefined();
    jest.advanceTimersByTime(1);
    expect(silent.transport.closed?.code).toBe(CloseCode.HeartbeatTimeout);

    app.monitor.stop();
    const late = connect(app, 2);
    state.now += 10 * INTERVAL;
    jest.advanceTimersByTime(10 * INTERVAL);
    expect(late.transport.closed).toBeUndefined();
  });
});

describe('graceful shutdown', () => {
  test('closes every connection with 1012, clears the rooms and stops the timer', async () => {
    jest.useFakeTimers();
    const { app } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    app.start();
    app.stop();
    for (const { transport, connection } of [ada, bob]) {
      expect(transport.closed?.code).toBe(CloseCode.ServiceRestart);
      expect(connection.rooms.size).toBe(0);
    }
    expect(app.connections.all()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
