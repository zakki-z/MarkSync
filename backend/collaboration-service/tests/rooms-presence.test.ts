import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { InMemoryPresenceRegistry } from '../src/presence-registry';
import { CloseCode, ErrorCode } from '../src/protocol';
import { connect, FakeAccess, join, leave } from './support';

const setup = (access = new FakeAccess()) => ({ access, app: createApp({ access }) });
const ids = (users?: { id: number }[]) => users?.map((user) => user.id);

describe('join and presence', () => {
  test('two members see each other online, and only public fields are broadcast', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    await app.dispatcher.dispatch(bob.connection, join(7));
    for (const { transport } of [ada, bob]) {
      expect(transport.lastPresence).toEqual({
        type: 'presence',
        workspaceId: 7,
        users: [
          { id: 1, displayName: 'user1' },
          { id: 2, displayName: 'user2' },
        ],
      });
    }
  });

  test('every join asks the workspace service, and rejoining stays idempotent', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(access.calls).toEqual(['token1:7', 'token1:7']);
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    expect([...ada.connection.rooms]).toEqual([7]);
  });

  test('leave removes the member and tells the others; leaving twice is harmless', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, leave(7));
    await app.dispatcher.dispatch(bob.connection, leave(7));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    expect(bob.connection.isOpen).toBe(true);
    const before = bob.transport.frames.length;
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(bob.transport.frames.length).toBe(before);
  });

  test('a disconnect removes the connection from its rooms and updates the others', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    app.connections.remove(bob.connection);
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    app.connections.remove(bob.connection);
    expect(ada.transport.of('presence')).toHaveLength(3);
  });

  test('rooms are isolated: presence of one workspace never reaches another', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(8));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    expect(ids(bob.transport.lastPresence?.users)).toEqual([2]);
    expect(ada.transport.of('presence')).toHaveLength(1);
  });

  test('one connection can be in several rooms', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(ada.connection, join(8));
    await app.dispatcher.dispatch(ada.connection, leave(7));
    expect([...ada.connection.rooms]).toEqual([8]);
    expect(ada.connection.isOpen).toBe(true);
  });
});

describe('multiple tabs', () => {
  test('a user stays online, listed once, until the last tab leaves', async () => {
    const { app } = setup();
    const observer = connect(app, 2);
    const tabA = connect(app, 1);
    const tabB = connect(app, 1);
    await app.dispatcher.dispatch(observer.connection, join(7));
    await app.dispatcher.dispatch(tabA.connection, join(7));
    await app.dispatcher.dispatch(tabB.connection, join(7));
    expect(ids(observer.transport.lastPresence?.users)).toEqual([1, 2]);
    app.connections.remove(tabA.connection);
    expect(ids(observer.transport.lastPresence?.users)).toEqual([1, 2]);
    await app.dispatcher.dispatch(tabB.connection, leave(7));
    expect(ids(observer.transport.lastPresence?.users)).toEqual([2]);
  });
});

describe('refused joins', () => {
  test('a non-member gets an error, is not added to the room and the connection closes', async () => {
    const { app, access } = setup();
    access.set('token3', 7, 'denied');
    const ada = connect(app, 1);
    const mallory = connect(app, 3);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(mallory.connection, join(7));
    expect(mallory.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.Forbidden,
      workspaceId: 7,
    });
    expect(mallory.transport.closed?.code).toBe(CloseCode.Forbidden);
    expect(mallory.connection.rooms.size).toBe(0);
    expect(mallory.transport.of('presence')).toHaveLength(0);
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
    expect(ada.transport.of('presence')).toHaveLength(1);
  });

  test('a refusal for one workspace keeps a connection that is still in another', async () => {
    const { app, access } = setup();
    access.set('token1', 8, 'denied');
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(ada.connection, join(8));
    expect(ada.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.Forbidden,
      workspaceId: 8,
    });
    expect(ada.transport.closed).toBeUndefined();
    expect([...ada.connection.rooms]).toEqual([7]);
  });

  test('an invalid token ends the whole connection with 4401', async () => {
    const { app, access } = setup();
    access.set('token1', 7, 'unauthenticated');
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(ada.transport.closed?.code).toBe(CloseCode.Unauthenticated);
    expect(ada.transport.of('error')[0]?.code).toBe(ErrorCode.Unauthenticated);
  });

  test('an unavailable workspace service fails closed and asks the client to retry', async () => {
    const { app } = setup(new FakeAccess('unavailable'));
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(ada.transport.of('error')[0]?.code).toBe(ErrorCode.Unavailable);
    expect(ada.transport.closed?.code).toBe(CloseCode.TryAgainLater);
    expect(ada.connection.rooms.size).toBe(0);
  });

  test('a rejoin that is now refused removes the member and notifies the others', async () => {
    const { app, access } = setup();
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(ada.connection, join(7));
    await app.dispatcher.dispatch(bob.connection, join(7));
    access.set('token2', 7, 'denied');
    await app.dispatcher.dispatch(bob.connection, join(7));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
  });
});

describe('dispatching', () => {
  test('malformed frames get an error and leave the connection open', async () => {
    const { app } = setup();
    const ada = connect(app, 1);
    for (const raw of [
      '{',
      '[]',
      JSON.stringify({ type: 'nope' }),
      Buffer.from('x'),
      JSON.stringify({ type: 'join', workspaceId: '7' }),
    ])
      await app.dispatcher.dispatch(ada.connection, raw);
    expect(ada.transport.of('error').map((error) => error.code)).toEqual(
      Array(5).fill(ErrorCode.InvalidMessage),
    );
    expect(ada.connection.isOpen).toBe(true);
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(ids(ada.transport.lastPresence?.users)).toEqual([1]);
  });

  test('a leave sent while a join is still being checked wins', async () => {
    const access = new FakeAccess();
    let release!: () => void;
    access.gate = new Promise<void>((resolve) => (release = resolve));
    const { app } = setup(access);
    const ada = connect(app, 1);
    const joining = app.dispatcher.dispatch(ada.connection, join(7));
    const leaving = app.dispatcher.dispatch(ada.connection, leave(7));
    release();
    await Promise.all([joining, leaving]);
    expect(ada.connection.rooms.size).toBe(0);
  });

  test('a disconnect during the access check cannot create a ghost member', async () => {
    const access = new FakeAccess();
    const { app } = setup(access);
    const ada = connect(app, 1);
    const bob = connect(app, 2);
    await app.dispatcher.dispatch(bob.connection, join(7));
    let release!: () => void;
    access.gate = new Promise<void>((resolve) => (release = resolve));
    const joining = app.dispatcher.dispatch(ada.connection, join(7));
    app.connections.close(ada.connection, CloseCode.GoingAway, 'bye');
    release();
    await joining;
    expect(ada.connection.rooms.size).toBe(0);
    expect(ids(bob.transport.lastPresence?.users)).toEqual([2]);
  });

  test('a failing handler is reported without crashing the dispatcher', async () => {
    const access = new FakeAccess();
    access.check = () => Promise.reject(new Error('boom'));
    const { app } = setup(access);
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, join(7));
    expect(ada.transport.of('error')[0]?.code).toBe(ErrorCode.Unavailable);
    expect(ada.connection.isOpen).toBe(true);
  });
});

describe('InMemoryPresenceRegistry', () => {
  test('lists each user once, ordered by id, and forgets empty workspaces', () => {
    const registry = new InMemoryPresenceRegistry();
    registry.add(1, 'a', { id: 5, displayName: 'five' });
    registry.add(1, 'b', { id: 2, displayName: 'two' });
    registry.add(1, 'c', { id: 5, displayName: 'five' });
    expect(registry.online(1).map((user) => user.id)).toEqual([2, 5]);
    registry.remove(1, 'a');
    expect(registry.online(1).map((user) => user.id)).toEqual([2, 5]);
    registry.remove(1, 'c');
    registry.remove(1, 'b');
    expect(registry.online(1)).toEqual([]);
    expect(registry.online(99)).toEqual([]);
  });
});
