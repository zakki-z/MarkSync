import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { createApp } from '../src/app';
import { encodeFrame, FrameKind } from '../src/document-frames';
import { markdownOf } from '../src/documents/yjs-content';
import { CloseCode, ErrorCode } from '../src/protocol';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';
import { connect, FakeAccess, FakeDocumentAccess, joinDocument, leaveDocument } from './support';
import { SyncPeer, syncFrame } from './sync-peer';

const DOC = 5;
const apps: ReturnType<typeof createApp>[] = [];
let documentAccess: FakeDocumentAccess;
let persistence: InMemoryDocumentPersistence;
let app: ReturnType<typeof createApp>;

function startApp(revalidateMs = 1000) {
  const created = createApp({
    access: new FakeAccess(),
    documentAccess,
    persistence,
    persistenceOptions: { debounceMs: 10, maxWaitMs: 50, retryMs: 10, compactAfter: 100 },
    revalidateMs,
  });
  apps.push(created);
  return created;
}

beforeEach(() => {
  documentAccess = new FakeDocumentAccess();
  persistence = new InMemoryDocumentPersistence();
  app = startApp();
});
afterEach(async () => {
  jest.useRealTimers();
  await Promise.all(apps.splice(0).map((created) => created.stop()));
});

const editor = (userId: number, markdown = '') =>
  documentAccess.set(`token${userId}`, DOC, { status: 'granted', canEdit: true, markdown });
const viewer = (userId: number, markdown = '') =>
  documentAccess.set(`token${userId}`, DOC, { status: 'granted', canEdit: false, markdown });
const insert = (peer: SyncPeer, text: string) =>
  peer.doc.getText('content').insert(peer.text.length, text);

describe('collaborative editing', () => {
  test('the first editor seeds the document, a later joiner receives it', async () => {
    editor(1, '# Existing');
    editor(2, '# Existing');
    const ada = new SyncPeer(app, 1, DOC);
    await ada.join();
    expect(ada.text.toString()).toBe('# Existing');

    const bob = new SyncPeer(app, 2, DOC);
    await bob.join();
    expect(bob.text.toString()).toBe('# Existing');
  });

  test('an edit reaches the other editors and is stored', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();

    insert(ada, 'Hello');
    await ada.settle();
    await bob.settle();
    expect(bob.text.toString()).toBe('Hello');

    await app.documents.leave(ada.connection, DOC);
    await app.documents.leave(bob.connection, DOC);
    expect(markdownOf(await loadStored())).toBe('Hello');
  });

  test('concurrent edits at the same position converge', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();

    insert(ada, 'A');
    insert(bob, 'B');
    await ada.settle();
    await bob.settle();
    await ada.settle();

    const text = ada.text.toString();
    expect(text).toHaveLength(2);
    expect(bob.text.toString()).toBe(text);
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe(text);
  });

  test('a client that reconnects receives what it missed and its offline edits are kept', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();
    insert(ada, 'one ');
    await ada.settle();
    await bob.settle();

    // Bob drops off; both sides keep editing.
    app.connections.close(bob.connection, CloseCode.HeartbeatTimeout, 'gone');
    insert(ada, 'ada-online ');
    await ada.settle();
    const offline = new Y.Doc();
    Y.applyUpdate(offline, Y.encodeStateAsUpdate(bob.doc));
    offline.getText('content').insert(offline.getText('content').length, 'bob-offline');

    // He comes back on a new connection with the document he kept.
    const back = new SyncPeer(app, 2, DOC);
    Y.applyUpdate(back.doc, Y.encodeStateAsUpdate(offline), 'restore');
    await back.join();
    await ada.settle();

    expect(back.text.toString()).toBe(ada.text.toString());
    expect(ada.text.toString()).toContain('one ');
    expect(ada.text.toString()).toContain('ada-online ');
    expect(ada.text.toString()).toContain('bob-offline');
    expect(ada.text.toString().split('bob-offline')).toHaveLength(2);
  });
});

describe('who may join', () => {
  test('a non-member is refused with an error, closed, and never creates a session', async () => {
    documentAccess.set('token9', DOC, { status: 'denied' });
    const eve = new SyncPeer(app, 9, DOC);
    await app.dispatcher.dispatch(eve.connection, joinDocument(DOC));
    expect(eve.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.Forbidden,
      documentId: DOC,
    });
    expect(eve.transport.closed?.code).toBe(CloseCode.Forbidden);
    expect(app.documents.get(DOC)).toBeUndefined();
    expect(persistence.appends).toBe(0);
  });

  test('an expired token closes with 4401 and an unavailable Document service with 1013', async () => {
    documentAccess.set('token8', DOC, { status: 'unauthenticated' });
    documentAccess.set('token7', DOC, { status: 'unavailable' });
    const expired = connect(app, 8);
    const outage = connect(app, 7);
    await app.dispatcher.dispatch(expired.connection, joinDocument(DOC));
    await app.dispatcher.dispatch(outage.connection, joinDocument(DOC));
    expect(expired.transport.closed?.code).toBe(CloseCode.Unauthenticated);
    expect(outage.transport.closed?.code).toBe(CloseCode.TryAgainLater);
  });

  test('a public document is readable by a non-member but their edits are dropped', async () => {
    editor(1, 'Public text');
    viewer(2, 'Public text');
    const ada = new SyncPeer(app, 1, DOC);
    const reader = new SyncPeer(app, 2, DOC);
    await ada.join();
    await reader.join();
    expect(reader.text.toString()).toBe('Public text');
    expect(reader.transport.lastDocumentAccess).toMatchObject({ documentId: DOC, canEdit: false });

    insert(reader, ' vandalism');
    await reader.settle();
    await ada.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('Public text');
    expect(ada.text.toString()).toBe('Public text');
  });

  test('syncing a document that was not joined is refused and changes nothing', async () => {
    editor(1);
    const ada = new SyncPeer(app, 1, DOC);
    await ada.join();
    const stranger = connect(app, 2);
    const doc = new Y.Doc();
    doc.getText('content').insert(0, 'sneaky');
    await app.dispatcher.dispatch(
      stranger.connection,
      syncFrame(DOC, (e) => syncProtocol.writeUpdate(e, Y.encodeStateAsUpdate(doc))),
    );
    expect(stranger.transport.of('error')[0]).toMatchObject({
      code: ErrorCode.NotJoined,
      documentId: DOC,
    });
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('');
  });
});

describe('read-only enforcement on the server', () => {
  test('a viewer receives live edits but cannot write, even with a forged client', async () => {
    editor(1);
    viewer(2);
    const ada = new SyncPeer(app, 1, DOC);
    const vera = new SyncPeer(app, 2, DOC);
    await ada.join();
    await vera.join();

    insert(ada, 'from ada');
    await ada.settle();
    await vera.settle();
    expect(vera.text.toString()).toBe('from ada');

    insert(vera, ' forged');
    await vera.settle();
    await ada.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('from ada');
    expect(ada.text.toString()).toBe('from ada');
    expect(vera.transport.of('document-access').at(-1)?.canEdit).toBe(false);
  });

  test('a viewer cannot push state through a sync step 2 either', async () => {
    viewer(2);
    const vera = new SyncPeer(app, 2, DOC);
    await vera.join();
    const forged = new Y.Doc();
    forged.getText('content').insert(0, 'forged');
    vera.send(syncFrame(DOC, (e) => syncProtocol.writeSyncStep2(e, forged)));
    await vera.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('');
  });

  test('a malformed update is answered with an error and the connection stays open', async () => {
    editor(1);
    const ada = new SyncPeer(app, 1, DOC);
    await ada.join();
    ada.send(
      encodeFrame(DOC, FrameKind.Sync, (e) =>
        encoding.writeUint8Array(e, new Uint8Array([2, 3, 255, 255, 255])),
      ),
    );
    await ada.settle();
    expect(ada.transport.of('error').at(-1)).toMatchObject({
      code: ErrorCode.InvalidMessage,
      documentId: DOC,
    });
    expect(ada.transport.closed).toBeUndefined();
    insert(ada, 'still works');
    await ada.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('still works');
  });

  test('a frame that is not a valid binary frame is invalid', async () => {
    const ada = connect(app, 1);
    await app.dispatcher.dispatch(ada.connection, new Uint8Array([255, 255, 255, 255, 255, 255]));
    expect(ada.transport.of('error')[0]?.code).toBe(ErrorCode.InvalidMessage);
  });
});

describe('revalidation of joined documents', () => {
  test('an editor demoted to viewer while connected can no longer write', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();
    insert(bob, 'allowed ');
    await bob.settle();
    await ada.settle();

    viewer(2);
    await app.revalidator.sweep();
    expect(bob.transport.lastDocumentAccess).toMatchObject({ canEdit: false });
    expect(bob.transport.closed).toBeUndefined();

    insert(bob, 'denied');
    await bob.settle();
    await ada.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('allowed ');
    expect(ada.text.toString()).toBe('allowed ');
  });

  test('a viewer promoted to editor can write after the next revalidation', async () => {
    viewer(2);
    const bob = new SyncPeer(app, 2, DOC);
    await bob.join();
    editor(2);
    await app.revalidator.sweep();
    expect(bob.transport.lastDocumentAccess).toMatchObject({ canEdit: true });
    insert(bob, 'now allowed');
    await bob.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('now allowed');
  });

  test('a member removed while connected is evicted with 4403 and their later updates are ignored', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();

    documentAccess.set('token2', DOC, { status: 'denied' });
    await app.revalidator.sweep();
    expect(bob.transport.of('error').at(-1)).toMatchObject({
      code: ErrorCode.Forbidden,
      documentId: DOC,
    });
    expect(bob.transport.closed?.code).toBe(CloseCode.Forbidden);
    expect(bob.connection.documents.size).toBe(0);

    insert(bob, 'ghost');
    await bob.settle();
    expect(markdownOf(app.documents.get(DOC)!.doc)).toBe('');
    expect(ada.transport.closed).toBeUndefined();
  });

  test('asks once per token and document however many tabs share them', async () => {
    editor(1);
    const tabs = [new SyncPeer(app, 1, DOC), new SyncPeer(app, 1, DOC)];
    for (const tab of tabs) await tab.join();
    documentAccess.calls.length = 0;
    await app.revalidator.sweep();
    expect(documentAccess.calls).toEqual([`token1:${DOC}`]);
  });
});

describe('leaving and cleanup', () => {
  test('leaving, or disconnecting, removes the connection and evicts the idle session', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();

    await app.dispatcher.dispatch(ada.connection, leaveDocument(DOC));
    expect(ada.connection.documents.size).toBe(0);
    expect(app.documents.get(DOC)).toBeDefined();

    app.connections.close(bob.connection, CloseCode.HeartbeatTimeout, 'gone');
    await Bun.sleep(0);
    await Promise.resolve();
    expect(app.documents.get(DOC)).toBeUndefined();
  });

  test('a document is not shared with a connection after it left', async () => {
    editor(1);
    editor(2);
    const ada = new SyncPeer(app, 1, DOC);
    const bob = new SyncPeer(app, 2, DOC);
    await ada.join();
    await bob.join();
    await app.dispatcher.dispatch(bob.connection, leaveDocument(DOC));
    const received = bob.transport.binary.length;
    insert(ada, 'private after leaving');
    await ada.settle();
    expect(bob.transport.binary).toHaveLength(received);
  });
});

async function loadStored() {
  const stored = await persistence.load(DOC);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, stored!.update);
  return doc;
}
