import { expect, test } from '@playwright/test';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { DocumentCollaboration, type DocumentSocket } from '../src/collab/DocumentCollaboration';
import { decodeFrame, encodeFrame as encodeBytes, FrameKind } from '../src/collab/frames';
import { CloseCode, ErrorCode, HEARTBEAT_INTERVAL_MS } from '../src/presence/protocol';
import type { Scheduler } from '../src/presence/WorkspacePresenceClient';

/** A frame whose payload is written with lib0, like the provider does. */
function makeFrame(
  documentId: number,
  kind: FrameKind,
  write: (encoder: encoding.Encoder) => void,
) {
  const encoder = encoding.createEncoder();
  write(encoder);
  return encodeBytes(documentId, kind, encoding.toUint8Array(encoder));
}

const DOCUMENT = 4;
const OPEN = 1;
const CLOSED = 3;

class FakeSocket implements DocumentSocket {
  readyState = 0;
  binaryType: DocumentSocket['binaryType'] = 'blob';
  json: Record<string, unknown>[] = [];
  frames: Array<ReturnType<typeof decodeFrame>> = [];
  /** How many of `frames` the fake service has already answered. */
  answered = 0;
  closedWith?: number;
  onopen: DocumentSocket['onopen'] = null;
  onmessage: DocumentSocket['onmessage'] = null;
  onclose: DocumentSocket['onclose'] = null;

  send(data: string | Uint8Array) {
    if (typeof data === 'string') this.json.push(JSON.parse(data));
    else this.frames.push(decodeFrame(data));
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
  receiveFrame(frame: Uint8Array) {
    this.onmessage?.({ data: frame.slice().buffer } as MessageEvent);
  }
  serverClose(code: number) {
    this.readyState = CLOSED;
    this.onclose?.({ code } as CloseEvent);
  }
  types() {
    return this.json.map((message) => message.type);
  }
  clear() {
    this.frames.length = 0;
    this.answered = 0;
  }
  syncFrames() {
    return this.frames.filter((frame) => frame?.kind === FrameKind.Sync);
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

/** The service's side of one socket: a real Y.Doc answering the Yjs sync handshake. */
class FakeService {
  readonly doc = new Y.Doc();
  canEdit = true;
  constructor(markdown = '') {
    this.doc.getText('content').insert(0, markdown);
  }
  get text() {
    return this.doc.getText('content').toString();
  }
  /** Joins like the real service: grants access and asks the client for its state. */
  accept(socket: FakeSocket) {
    socket.receive({ type: 'document-access', documentId: DOCUMENT, canEdit: this.canEdit });
    socket.receiveFrame(
      makeFrame(DOCUMENT, FrameKind.Sync, (e) => syncProtocol.writeSyncStep1(e, this.doc)),
    );
  }
  /** Processes everything the client sent since the last call and answers it. */
  process(socket: FakeSocket) {
    for (const frame of socket.frames.slice(socket.answered)) {
      socket.answered++;
      if (frame?.kind !== FrameKind.Sync) continue;
      const decoder = decoding.createDecoder(frame.payload);
      if (!this.canEdit && decoding.peekVarUint(decoder) !== syncProtocol.messageYjsSyncStep1)
        continue;
      const reply = encoding.createEncoder();
      syncProtocol.readSyncMessage(decoder, reply, this.doc, 'client');
      if (encoding.length(reply) > 0)
        socket.receiveFrame(
          makeFrame(DOCUMENT, FrameKind.Sync, (e) =>
            encoding.writeUint8Array(e, encoding.toUint8Array(reply)),
          ),
        );
    }
  }
  /** An edit made by someone else, pushed to the client. */
  remoteEdit(socket: FakeSocket, change: (text: Y.Text) => void) {
    const updates: Uint8Array[] = [];
    const collect = (update: Uint8Array) => updates.push(update);
    this.doc.on('update', collect);
    change(this.doc.getText('content'));
    this.doc.off('update', collect);
    for (const update of updates)
      socket.receiveFrame(
        makeFrame(DOCUMENT, FrameKind.Sync, (e) => syncProtocol.writeUpdate(e, update)),
      );
  }
}

function setup(options: { random?: number; markdown?: string } = {}) {
  const scheduler = new ManualScheduler();
  const sockets: FakeSocket[] = [];
  const expired: number[] = [];
  const collab = new DocumentCollaboration({
    documentId: DOCUMENT,
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    scheduler,
    random: () => options.random ?? 0,
    onSessionExpired: () => expired.push(1),
  });
  const service = new FakeService(options.markdown);
  const connect = () => {
    const socket = sockets.at(-1)!;
    socket.open();
    service.accept(socket);
    service.process(socket);
    return socket;
  };
  return { collab, scheduler, sockets, expired, service, connect };
}

test.describe('connecting and syncing', () => {
  test('joins the document, shows connected and receives the stored text', () => {
    const { collab, sockets, service, connect } = setup({ markdown: '# Existing' });
    collab.start();
    expect(collab.getSnapshot()).toMatchObject({ status: 'connecting', canEdit: undefined });
    const socket = connect();

    expect(sockets).toHaveLength(1);
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.json[0]).toEqual({ type: 'document-join', documentId: DOCUMENT });
    expect(collab.getSnapshot()).toMatchObject({
      status: 'connected',
      canEdit: true,
      synced: true,
      hasSynced: true,
      markdown: '# Existing',
    });
    expect(service.text).toBe('# Existing');
  });

  test('local edits reach the service and remote edits reach the local text', () => {
    const { collab, service, connect } = setup();
    collab.start();
    const socket = connect();

    collab.text.insert(0, 'local ');
    service.process(socket);
    expect(service.text).toBe('local ');

    service.remoteEdit(socket, (t) => t.insert(t.length, 'remote'));
    expect(collab.getSnapshot().markdown).toBe('local remote');
  });

  test('undo reverts only the local changes, never someone else’s', () => {
    const { collab, service, connect } = setup();
    collab.start();
    const socket = connect();

    collab.text.insert(0, 'mine ');
    service.process(socket);
    service.remoteEdit(socket, (t) => t.insert(t.length, 'theirs'));
    expect(collab.text.toString()).toBe('mine theirs');
    collab.undoManager.undo();
    expect(collab.text.toString()).toBe('theirs');
  });

  test('a connection that may only read never sends updates', () => {
    const { collab, service, connect } = setup({ markdown: 'text' });
    service.canEdit = false;
    collab.start();
    const socket = connect();
    expect(collab.getSnapshot()).toMatchObject({ canEdit: false, hasSynced: true });

    socket.clear();
    collab.text.insert(0, 'forged ');
    expect(socket.syncFrames()).toHaveLength(0);
  });

  test('a permission change from the server takes effect at once', () => {
    const { collab, service, connect } = setup();
    collab.start();
    const socket = connect();
    collab.text.insert(0, 'before ');
    service.process(socket);

    socket.receive({ type: 'document-access', documentId: DOCUMENT, canEdit: false });
    expect(collab.getSnapshot().canEdit).toBe(false);
    socket.clear();
    collab.text.insert(0, 'after ');
    expect(socket.syncFrames()).toHaveLength(0);

    socket.receive({ type: 'document-access', documentId: DOCUMENT, canEdit: true });
    expect(collab.getSnapshot().canEdit).toBe(true);
  });

  test('ignores messages about other documents and malformed frames', () => {
    const { collab, sockets, connect } = setup();
    collab.start();
    const socket = connect();
    socket.receive({ type: 'document-access', documentId: 99, canEdit: false });
    socket.receive({ type: 'error', code: ErrorCode.Forbidden, message: 'm', documentId: 99 });
    socket.receiveFrame(
      makeFrame(99, FrameKind.Sync, (e) => encoding.writeUint8Array(e, new Uint8Array([1]))),
    );
    socket.onmessage?.({ data: new Uint8Array([255, 255]).buffer } as MessageEvent);
    socket.onmessage?.({ data: 'not json' } as MessageEvent);
    expect(collab.getSnapshot()).toMatchObject({ status: 'connected', canEdit: true });
    expect(sockets).toHaveLength(1);
  });
});

test.describe('reconnecting', () => {
  test('after a loss it reconnects with the presence backoff and syncs again', () => {
    const { collab, scheduler, sockets, connect } = setup({ random: 0 });
    collab.start();
    connect().serverClose(1006);
    expect(collab.getSnapshot()).toMatchObject({ status: 'reconnecting', synced: false });
    expect(scheduler.delays).toEqual([500]);

    scheduler.advance(499);
    expect(sockets).toHaveLength(1);
    scheduler.advance(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.serverClose(1006);
    expect(scheduler.delays).toEqual([500, 1000]);
    scheduler.advance(1000);
    connect();
    expect(collab.getSnapshot().status).toBe('connected');
    // A successful join starts the backoff over.
    sockets.at(-1)!.serverClose(1006);
    expect(scheduler.delays.at(-1)).toBe(500);
  });

  test('edits made while offline are merged on reconnect, once, with what others wrote meanwhile', () => {
    const { collab, scheduler, sockets, service, connect } = setup({ markdown: 'start ' });
    collab.start();
    const first = connect();
    first.serverClose(1006);

    collab.text.insert(collab.text.length, 'offline ');
    service.doc.getText('content').insert(0, 'others ');
    scheduler.advance(500);
    expect(sockets).toHaveLength(2);
    connect();

    expect(service.text).toBe(collab.text.toString());
    for (const part of ['start ', 'offline ', 'others '])
      expect(service.text.split(part)).toHaveLength(2);
  });

  test('forgets other people’s cursors when the connection is lost', () => {
    const { collab, connect } = setup();
    collab.start();
    const socket = connect();
    const remote = new awarenessProtocol.Awareness(new Y.Doc());
    remote.setLocalState({ user: { name: 'ada' }, cursor: null });
    socket.receiveFrame(
      makeFrame(DOCUMENT, FrameKind.Awareness, (e) =>
        encoding.writeVarUint8Array(
          e,
          awarenessProtocol.encodeAwarenessUpdate(remote, [remote.clientID]),
        ),
      ),
    );
    expect(collab.awareness.getStates().has(remote.clientID)).toBe(true);

    socket.serverClose(1006);
    expect(collab.awareness.getStates().has(remote.clientID)).toBe(false);
    remote.destroy();
  });

  test('does not reconnect when the session expired or access was revoked', () => {
    const expiredCase = setup();
    expiredCase.collab.start();
    expiredCase.connect().serverClose(CloseCode.Unauthenticated);
    expect(expiredCase.expired).toHaveLength(1);
    expect(expiredCase.collab.getSnapshot()).toMatchObject({ status: 'disconnected' });
    expiredCase.scheduler.advance(60_000);
    expect(expiredCase.sockets).toHaveLength(1);

    const revoked = setup();
    revoked.collab.start();
    revoked.connect().serverClose(CloseCode.Forbidden);
    expect(revoked.collab.getSnapshot()).toMatchObject({ status: 'revoked', canEdit: false });
    revoked.scheduler.advance(60_000);
    expect(revoked.sockets).toHaveLength(1);
  });

  test('a FORBIDDEN error for the document revokes access; UNAVAILABLE reconnects', () => {
    const revoked = setup();
    revoked.collab.start();
    revoked.connect().receive({
      type: 'error',
      code: ErrorCode.Forbidden,
      message: 'No',
      documentId: DOCUMENT,
    });
    expect(revoked.collab.getSnapshot()).toMatchObject({ status: 'revoked', canEdit: false });

    const outage = setup();
    outage.collab.start();
    outage.connect().receive({
      type: 'error',
      code: ErrorCode.Unavailable,
      message: 'Later',
      documentId: DOCUMENT,
    });
    expect(outage.collab.getSnapshot().status).toBe('reconnecting');
  });

  test('presumes the connection dead after unanswered heartbeats', () => {
    const { collab, scheduler, sockets, connect } = setup();
    collab.start();
    const socket = connect();
    scheduler.advance(HEARTBEAT_INTERVAL_MS * 3);
    expect(socket.types().filter((type) => type === 'heartbeat')).toHaveLength(3);
    expect(collab.getSnapshot().status).toBe('connected');
    scheduler.advance(HEARTBEAT_INTERVAL_MS);
    expect(collab.getSnapshot().status).toBe('reconnecting');
    scheduler.advance(30_000);
    expect(sockets).toHaveLength(2);
  });
});

test.describe('awareness', () => {
  test('announces the local cursor after joining and when it changes', () => {
    const { collab, connect } = setup();
    collab.start();
    const socket = connect();
    const announced = () => socket.frames.filter((frame) => frame?.kind === FrameKind.Awareness);
    expect(announced().length).toBeGreaterThan(0);

    socket.clear();
    collab.awareness.setLocalStateField('cursor', { anchor: null, head: null });
    expect(announced()).toHaveLength(1);
  });
});

test.describe('cleanup', () => {
  test('dispose leaves the document, closes the socket and releases everything', () => {
    const { collab, scheduler, connect } = setup();
    collab.start();
    const socket = connect();
    let notifications = 0;
    collab.subscribe(() => notifications++);
    expect(scheduler.pending).toBe(1);

    collab.dispose();

    expect(socket.types()).toContain('document-leave');
    expect(socket.closedWith).toBe(1000);
    expect(socket.onopen).toBeNull();
    expect(socket.onmessage).toBeNull();
    expect(socket.onclose).toBeNull();
    expect(scheduler.pending).toBe(0);
    expect(collab.doc.isDestroyed).toBe(true);
    expect(notifications).toBe(0);
    // A late event from the old socket does nothing, and disposing twice is harmless.
    collab.dispose();
  });

  test('dispose tells the others the cursor is gone', () => {
    const { collab, connect } = setup();
    collab.start();
    const socket = connect();
    const clientId = collab.doc.clientID;
    collab.dispose();

    const announcements = socket.frames
      .filter((frame) => frame?.kind === FrameKind.Awareness)
      .map((frame) => decoding.readVarUint8Array(decoding.createDecoder(frame!.payload)));
    const observer = new awarenessProtocol.Awareness(new Y.Doc());
    observer.setLocalState(null);
    for (const update of announcements.slice(0, -1))
      awarenessProtocol.applyAwarenessUpdate(observer, update, 'test');
    expect(observer.getStates().has(clientId)).toBe(true);
    awarenessProtocol.applyAwarenessUpdate(observer, announcements.at(-1)!, 'test');
    expect(observer.getStates().has(clientId)).toBe(false);
    observer.destroy();
  });

  test('dispose before the connection opened or after a revocation is safe', () => {
    const early = setup();
    early.collab.start();
    early.collab.dispose();
    expect(early.sockets[0]!.closedWith).toBe(1000);
    expect(early.scheduler.pending).toBe(0);

    const late = setup();
    late.collab.start();
    late.connect().serverClose(CloseCode.Forbidden);
    late.collab.dispose();
    expect(late.collab.doc.isDestroyed).toBe(true);
  });

  test('no timers survive a reconnect cycle that was cut short', () => {
    const { collab, scheduler, connect } = setup();
    collab.start();
    connect().serverClose(1006);
    expect(scheduler.pending).toBe(1);
    collab.dispose();
    expect(scheduler.pending).toBe(0);
  });
});
