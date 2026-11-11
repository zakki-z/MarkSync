import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { createApp } from '../src/app';
import { decodeFrame, encodeFrame, FrameKind } from '../src/document-frames';
import { connect, joinDocument } from './support';

type App = ReturnType<typeof createApp>;

/**
 * A Yjs client wired straight into the dispatcher with a fake transport: it joins a document,
 * runs the sync handshake with whatever the server sends and sends its local edits, like the
 * browser provider does. `settle()` waits until no frames are left to process.
 */
export class SyncPeer {
  readonly doc = new Y.Doc();
  readonly session: ReturnType<typeof connect>;
  private processed = 0;
  private inflight: Promise<void>[] = [];

  constructor(
    private readonly app: App,
    readonly userId: number,
    readonly documentId: number,
  ) {
    this.session = connect(app, userId);
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== this)
        this.send(syncFrame(documentId, (e) => syncProtocol.writeUpdate(e, update)));
    });
  }

  get connection() {
    return this.session.connection;
  }

  get transport() {
    return this.session.transport;
  }

  get text() {
    return this.doc.getText('content');
  }

  async join() {
    await this.app.dispatcher.dispatch(this.connection, joinDocument(this.documentId));
    this.send(syncFrame(this.documentId, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
    await this.settle();
  }

  /** Sends a raw frame to the server, as a misbehaving client might. */
  send(frame: Uint8Array | string) {
    this.inflight.push(this.app.dispatcher.dispatch(this.connection, frame));
  }

  /** Processes the server's frames and sends the replies until both sides are quiet. */
  async settle() {
    for (;;) {
      await Promise.all(this.inflight.splice(0));
      const frames = this.transport.binary.slice(this.processed);
      this.processed = this.transport.binary.length;
      if (frames.length === 0 && this.inflight.length === 0) return;
      for (const raw of frames) this.receive(raw);
    }
  }

  private receive(raw: Uint8Array) {
    const frame = decodeFrame(raw);
    if (!frame || frame.kind !== FrameKind.Sync || frame.documentId !== this.documentId) return;
    const decoder = decoding.createDecoder(frame.payload);
    const reply = encoding.createEncoder();
    syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
    if (encoding.length(reply) > 0)
      this.send(
        syncFrame(this.documentId, (e) =>
          encoding.writeUint8Array(e, encoding.toUint8Array(reply)),
        ),
      );
  }
}

const syncFrame = (documentId: number, write: (encoder: encoding.Encoder) => void) =>
  encodeFrame(documentId, FrameKind.Sync, write);

export { syncFrame };
