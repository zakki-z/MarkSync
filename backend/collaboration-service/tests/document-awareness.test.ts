import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { CloseCode, ErrorCode } from '../src/protocol';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';
import { connect, FakeAccess, FakeDocumentAccess } from './support';
import { rawAwareness, SyncPeer } from './sync-peer';

const DOC = 6;
let app: ReturnType<typeof createApp>;
let documentAccess: FakeDocumentAccess;
const peers: SyncPeer[] = [];

beforeEach(() => {
  documentAccess = new FakeDocumentAccess();
  app = createApp({
    access: new FakeAccess(),
    documentAccess,
    persistence: new InMemoryDocumentPersistence(),
    persistenceOptions: { debounceMs: 10, maxWaitMs: 50, retryMs: 10, compactAfter: 100 },
  });
});
afterEach(async () => {
  for (const peer of peers.splice(0)) peer.destroy();
  await app.stop();
});

async function joined(userId: number, canEdit = true) {
  documentAccess.set(`token${userId}`, DOC, { status: 'granted', canEdit, markdown: '' });
  const peer = new SyncPeer(app, userId, DOC);
  peers.push(peer);
  await peer.join();
  return peer;
}

const position = (index: number) => ({
  type: null,
  tname: 'content',
  item: { client: 77, clock: index },
  assoc: 0,
});
const cursor = (anchor: number, head: number) => ({
  anchor: position(anchor),
  head: position(head),
});
const stateOf = (peer: SyncPeer, clientId: number) => peer.awareness.getStates().get(clientId);

describe('awareness', () => {
  test('a cursor and selection reach the other members with the server-known identity', async () => {
    const ada = await joined(1);
    const bob = await joined(2);

    ada.awareness.setLocalState({ user: { name: 'ignored' }, cursor: cursor(2, 5) });
    await ada.settle();
    await bob.settle();

    const seen = stateOf(bob, ada.doc.clientID);
    expect(seen).toEqual({
      user: { id: 1, name: 'user1', color: expect.stringMatching(/^#[0-9a-f]{6}$/) },
      cursor: cursor(2, 5),
    });
  });

  test('forged identities and extra fields are stripped, so only public data is relayed', async () => {
    const ada = await joined(1);
    const bob = await joined(2);

    ada.send(
      rawAwareness(DOC, ada.doc.clientID, 1, {
        user: { id: 99, name: 'admin', color: 'red', email: 'ada@example.com' },
        email: 'ada@example.com',
        token: 'secret',
        cursor: { ...cursor(1, 1), note: 'x' },
      }),
    );
    await ada.settle();
    await bob.settle();

    const seen = stateOf(bob, ada.doc.clientID)!;
    expect(Object.keys(seen).sort()).toEqual(['cursor', 'user']);
    expect(seen.user.id).toBe(1);
    expect(seen.user.name).toBe('user1');
    const wire = JSON.stringify(seen);
    for (const leaked of ['email', 'token', 'secret', 'admin', 'note'])
      expect(wire).not.toContain(leaked);
  });

  test('a malformed selection is dropped but the collaborator still shows up', async () => {
    const ada = await joined(1);
    const bob = await joined(2);
    for (const [clock, bad] of [
      [1, { anchor: 'x', head: 2 }],
      [2, { anchor: position(1), head: { ...position(1), tname: 'n'.repeat(500) } }],
      [3, { anchor: position(1), head: { ...position(1), item: { client: -1, clock: 1.5 } } }],
    ] as const) {
      ada.send(rawAwareness(DOC, ada.doc.clientID, clock, { cursor: bad }));
      await ada.settle();
      await bob.settle();
      expect(stateOf(bob, ada.doc.clientID)).toMatchObject({ user: { id: 1 }, cursor: null });
    }
  });

  test('someone who joins later sees who is already here', async () => {
    const ada = await joined(1);
    ada.awareness.setLocalState({ cursor: cursor(0, 0) });
    await ada.settle();
    const bob = await joined(2);
    expect(stateOf(bob, ada.doc.clientID)).toMatchObject({ user: { id: 1, name: 'user1' } });
  });

  test('read-only members can share their cursor', async () => {
    const ada = await joined(1);
    const vera = await joined(2, false);
    vera.awareness.setLocalState({ cursor: cursor(3, 3) });
    await vera.settle();
    await ada.settle();
    expect(stateOf(ada, vera.doc.clientID)).toMatchObject({
      user: { id: 2 },
      cursor: cursor(3, 3),
    });
  });

  test('leaving the document, or disconnecting, removes the state for everyone', async () => {
    const ada = await joined(1);
    const bob = await joined(2);
    const carl = await joined(3);
    ada.awareness.setLocalState({ cursor: cursor(1, 1) });
    bob.awareness.setLocalState({ cursor: cursor(2, 2) });
    await ada.settle();
    await bob.settle();
    await carl.settle();
    expect(stateOf(carl, ada.doc.clientID)).toBeDefined();
    expect(stateOf(carl, bob.doc.clientID)).toBeDefined();

    await app.documents.leave(ada.connection, DOC);
    app.connections.close(bob.connection, CloseCode.HeartbeatTimeout, 'gone');
    await carl.settle();

    expect(stateOf(carl, ada.doc.clientID)).toBeUndefined();
    expect(stateOf(carl, bob.doc.clientID)).toBeUndefined();
  });

  test('a client that announces it is going offline is removed', async () => {
    const ada = await joined(1);
    const bob = await joined(2);
    ada.awareness.setLocalState({ cursor: cursor(1, 1) });
    await ada.settle();
    await bob.settle();
    ada.awareness.setLocalState(null);
    await ada.settle();
    await bob.settle();
    expect(stateOf(bob, ada.doc.clientID)).toBeUndefined();
  });

  test('a member evicted by revalidation disappears from the others view', async () => {
    const ada = await joined(1);
    const bob = await joined(2);
    bob.awareness.setLocalState({ cursor: cursor(1, 1) });
    await bob.settle();
    await ada.settle();
    documentAccess.set('token2', DOC, { status: 'denied' });
    await app.revalidator.sweep();
    await ada.settle();
    expect(stateOf(ada, bob.doc.clientID)).toBeUndefined();
  });
});

describe('who controls a client id', () => {
  test('another user cannot overwrite a state that is not theirs', async () => {
    const ada = await joined(1);
    const eve = await joined(2);
    const observer = await joined(3);
    ada.awareness.setLocalState({ cursor: cursor(1, 1) });
    await ada.settle();
    await observer.settle();

    eve.send(rawAwareness(DOC, ada.doc.clientID, 99, { cursor: cursor(9, 9) }));
    await eve.settle();
    await observer.settle();

    expect(stateOf(observer, ada.doc.clientID)).toMatchObject({
      user: { id: 1 },
      cursor: cursor(1, 1),
    });
  });

  test('one connection controls only one client id', async () => {
    const ada = await joined(1);
    const bob = await joined(2);
    ada.awareness.setLocalState({ cursor: cursor(1, 1) });
    await ada.settle();
    ada.send(rawAwareness(DOC, 424242, 1, { cursor: cursor(1, 1) }));
    await ada.settle();
    await bob.settle();
    expect(stateOf(bob, 424242)).toBeUndefined();
  });

  test('a reconnecting client takes its client id over from its own stale connection', async () => {
    const first = await joined(1);
    const watcher = await joined(2);
    first.awareness.setLocalState({ cursor: cursor(1, 1) });
    await first.settle();
    await watcher.settle();

    // The same browser connects again before the server noticed the first connection died.
    const second = new SyncPeer(app, 1, DOC);
    peers.push(second);
    await second.join();
    second.send(rawAwareness(DOC, first.doc.clientID, 50, { cursor: cursor(4, 4) }));
    await second.settle();
    await watcher.settle();
    expect(stateOf(watcher, first.doc.clientID)).toMatchObject({ cursor: cursor(4, 4) });

    // The stale connection finally times out; the live cursor must not disappear with it.
    app.connections.close(first.connection, CloseCode.HeartbeatTimeout, 'gone');
    await watcher.settle();
    expect(stateOf(watcher, first.doc.clientID)).toMatchObject({ cursor: cursor(4, 4) });
  });
});

describe('invalid awareness messages', () => {
  test('awareness for a document that was not joined is refused', async () => {
    const stranger = connect(app, 5);
    await app.dispatcher.dispatch(stranger.connection, rawAwareness(DOC, 1, 1, { cursor: null }));
    expect(stranger.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.NotJoined,
      documentId: DOC,
    });
  });

  test('garbage is answered with an error and the connection stays open', async () => {
    const ada = await joined(1);
    ada.send(rawAwareness(DOC, 1, 1, 'not json').slice(0, 6));
    await ada.settle();
    expect(ada.transport.of('error').at(-1)).toMatchObject({
      code: ErrorCode.InvalidMessage,
      documentId: DOC,
    });
    expect(ada.transport.closed).toBeUndefined();
  });
});
