import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { decodeFrame, encodeFrame, FrameKind } from '../src/document-frames';
import type { ServerMessage } from '../src/protocol';

export const ORIGIN = 'http://localhost:8080';

/** Polls until the condition holds. Fails the test with `what` after the timeout. */
export async function eventually(condition: () => boolean, what: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await Bun.sleep(5);
  }
}

/**
 * A minimal real Yjs client over a real WebSocket, doing what the browser provider does: join the
 * document, run the sync handshake, send local edits, and after a disconnect connect again and
 * handshake again, keeping the same Y.Doc (and so any edits made while offline).
 */
export class CollabClient {
  readonly doc = new Y.Doc();
  canEdit?: boolean;
  closeCode?: number;
  readonly errors: Extract<ServerMessage, { type: 'error' }>[] = [];
  private ws?: WebSocket;
  private joined = false;
  private synced = false;

  constructor(
    /** Where to connect; a restarted service may listen elsewhere. */
    public port: number | undefined,
    private readonly token: string,
    readonly documentId: number,
  ) {
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== this && this.joined)
        this.transmit(syncFrame(documentId, (e) => syncProtocol.writeUpdate(e, update)));
    });
  }

  get text() {
    return this.doc.getText('content');
  }

  get value() {
    return this.text.toString();
  }

  get isSynced() {
    return this.synced;
  }

  /** Opens a socket, joins and resolves once the server's state has arrived. */
  async connect() {
    this.joined = this.synced = false;
    this.closeCode = undefined;
    const ws = new WebSocket(`ws://localhost:${this.port}/ws`, {
      headers: { Origin: ORIGIN, Cookie: `marksync_session=${this.token}` },
    } as unknown as string[]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.addEventListener('message', (event) => this.receive(event.data));
    ws.addEventListener('close', (event) => {
      this.closeCode = event.code;
      this.joined = this.synced = false;
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('socket refused')), { once: true });
    });
    ws.send(JSON.stringify({ type: 'document-join', documentId: this.documentId }));
    await eventually(
      () => this.synced || this.closeCode !== undefined || this.errors.length > 0,
      'the first sync',
    );
  }

  /** Closes the socket the way a lost connection does: the document stays as it is. */
  async disconnect() {
    const ws = this.ws;
    if (!ws || ws.readyState === WebSocket.CLOSED) return;
    ws.close(1000);
    await eventually(() => this.closeCode !== undefined, 'the socket to close');
  }

  edit(change: (text: Y.Text) => void) {
    this.doc.transact(() => change(this.text));
  }

  private receive(data: unknown) {
    if (typeof data === 'string') {
      const message = JSON.parse(data) as ServerMessage;
      if (message.type === 'document-access') {
        this.canEdit = message.canEdit;
        this.joined = true;
        this.transmit(syncFrame(this.documentId, (e) => syncProtocol.writeSyncStep1(e, this.doc)));
      } else if (message.type === 'error') this.errors.push(message);
      return;
    }
    const frame = decodeFrame(new Uint8Array(data as ArrayBuffer));
    if (!frame || frame.kind !== FrameKind.Sync) return;
    const reply = encoding.createEncoder();
    const type = syncProtocol.readSyncMessage(
      decoding.createDecoder(frame.payload),
      reply,
      this.doc,
      this,
    );
    if (encoding.length(reply) > 0)
      this.transmit(
        syncFrame(this.documentId, (e) =>
          encoding.writeUint8Array(e, encoding.toUint8Array(reply)),
        ),
      );
    if (type === syncProtocol.messageYjsSyncStep2) this.synced = true;
  }

  private transmit(frame: Uint8Array) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }
}

const syncFrame = (documentId: number, write: (encoder: encoding.Encoder) => void) =>
  encodeFrame(documentId, FrameKind.Sync, write);
