import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import {
  browserScheduler,
  MAX_UNANSWERED,
  reconnectDelay,
  type ConnectionStatus,
  type Scheduler,
} from '@/src/presence/WorkspacePresenceClient';
import {
  CloseCode,
  ErrorCode,
  HEARTBEAT_INTERVAL_MS,
  parseServerMessage,
  type ClientMessage,
} from '@/src/presence/protocol';
import { decodeFrame, encodeFrame, FrameKind } from './frames';

/** The part of the browser's WebSocket the provider uses, so tests can substitute a fake. */
export interface DocumentSocket {
  readonly readyState: number;
  binaryType: 'arraybuffer' | 'blob';
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string | Uint8Array): void;
  close(code?: number): void;
}

/** Everything the UI shows. A new object on every change, so it can back a React store. */
export type CollaborationSnapshot = {
  status: ConnectionStatus;
  /** What the server allows. Unknown until the server has answered the join. */
  canEdit: boolean | undefined;
  /** The server's state has arrived on the current connection. */
  synced: boolean;
  /** The server's state arrived at least once, so the text can be trusted and edited. */
  hasSynced: boolean;
  markdown: string;
};

export const CONTENT_FIELD = 'content';
const SOCKET_OPEN = 1;

type Options = {
  documentId: number;
  createSocket: () => DocumentSocket;
  scheduler?: Scheduler;
  random?: () => number;
  /** Called when the server says the session is no longer valid. */
  onSessionExpired?: () => void;
};

/**
 * The browser side of a collaborative document: it owns the Y.Doc, connects to the collaboration
 * service, joins the document, runs the Yjs sync handshake and exchanges awareness. After any loss
 * it reconnects with the presence client's backoff and handshakes again, which sends whatever was
 * typed while offline. It never reconnects when the session expired or access was revoked. The
 * server decides what the user may do; this class only reports it.
 */
export class DocumentCollaboration {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText(CONTENT_FIELD);
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  /** Undoes only this user's changes: remote updates are applied with another origin. */
  readonly undoManager = new Y.UndoManager(this.text);

  private snapshot: CollaborationSnapshot = {
    status: 'connecting',
    canEdit: undefined,
    synced: false,
    hasSynced: false,
    markdown: '',
  };
  private readonly listeners = new Set<() => void>();
  private readonly documentId: number;
  private readonly createSocket: () => DocumentSocket;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;
  private readonly onSessionExpired?: () => void;
  private socket?: DocumentSocket;
  private stopHeartbeat?: () => void;
  private cancelReconnect?: () => void;
  private attempts = 0;
  private unanswered = 0;
  private joined = false;
  private disposed = false;

  constructor(options: Options) {
    this.documentId = options.documentId;
    this.createSocket = options.createSocket;
    this.scheduler = options.scheduler ?? browserScheduler;
    this.random = options.random ?? Math.random;
    this.onSessionExpired = options.onSessionExpired;
    this.awareness.setLocalState({});
    this.doc.on('update', this.onDocumentUpdate);
    this.awareness.on('update', this.onAwarenessUpdate);
    this.text.observe(() => this.update({ markdown: this.text.toString() }));
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start() {
    this.update({ markdown: this.text.toString() });
    this.connect();
  }

  /** Leaves the document, closes the socket and releases everything. It cannot be restarted. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    // Tell the others we are gone, then leave, while the socket is still usable.
    this.awareness.setLocalState(null);
    if (this.joined) this.transmitMessage({ type: 'document-leave', documentId: this.documentId });
    this.detach();
    this.listeners.clear();
    this.awareness.destroy();
    this.undoManager.destroy();
    this.doc.destroy();
  }

  private connect() {
    const socket = this.createSocket();
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.unanswered = 0;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.transmitMessage({ type: 'document-join', documentId: this.documentId });
      this.stopHeartbeat = this.scheduler.every(HEARTBEAT_INTERVAL_MS, () => this.beat(socket));
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.closed(event.code);
    };
  }

  private beat(socket: DocumentSocket) {
    if (this.socket !== socket) return;
    if (this.unanswered >= MAX_UNANSWERED) {
      // A dead network may never deliver a close event, so do not wait for one.
      this.abandon();
      return;
    }
    this.unanswered++;
    this.transmitMessage({ type: 'heartbeat' });
  }

  private receive(data: unknown) {
    this.unanswered = 0;
    if (typeof data === 'string') this.receiveMessage(data);
    else if (data instanceof ArrayBuffer) this.receiveFrame(new Uint8Array(data));
  }

  private receiveMessage(raw: string) {
    const message = parseServerMessage(raw);
    if (!message) return;
    switch (message.type) {
      case 'document-access':
        if (message.documentId === this.documentId) this.accessGranted(message.canEdit);
        return;
      case 'error':
        if (message.documentId === this.documentId) this.failed(message.code);
        return;
      default:
        return;
    }
  }

  private accessGranted(canEdit: boolean) {
    const first = !this.joined;
    this.joined = true;
    this.attempts = 0;
    this.update({ status: 'connected', canEdit });
    if (!first) return;
    // Ask for what we are missing; the server answers with it and asks for ours in turn.
    this.transmitFrame(FrameKind.Sync, (encoder) => syncProtocol.writeSyncStep1(encoder, this.doc));
    // Announce our cursor again: the server forgot it when the old connection ended.
    this.awareness.setLocalState(this.awareness.getLocalState() ?? {});
  }

  private receiveFrame(raw: Uint8Array) {
    const frame = decodeFrame(raw);
    if (!frame || frame.documentId !== this.documentId) return;
    if (frame.kind === FrameKind.Awareness) {
      const update = decoding.readVarUint8Array(decoding.createDecoder(frame.payload));
      awarenessProtocol.applyAwarenessUpdate(this.awareness, update, this);
      return;
    }
    const reply = encoding.createEncoder();
    const type = syncProtocol.readSyncMessage(
      decoding.createDecoder(frame.payload),
      reply,
      this.doc,
      this,
    );
    if (encoding.length(reply) > 0)
      this.transmitFrame(FrameKind.Sync, (encoder) =>
        encoding.writeUint8Array(encoder, encoding.toUint8Array(reply)),
      );
    if (type === syncProtocol.messageYjsSyncStep2) this.update({ synced: true, hasSynced: true });
  }

  private failed(code: ErrorCode) {
    if (code === ErrorCode.Forbidden) this.end('revoked');
    else if (code === ErrorCode.Unauthenticated) {
      this.end('disconnected');
      this.onSessionExpired?.();
    } else if (code === ErrorCode.Unavailable) this.abandon();
  }

  private closed(code: number) {
    if (code === CloseCode.Unauthenticated) {
      this.end('disconnected');
      this.onSessionExpired?.();
    } else if (code === CloseCode.Forbidden) this.end('revoked');
    else this.abandon();
  }

  /** Gives up on the current socket and schedules a new one. */
  private abandon() {
    this.detach();
    this.forgetOthers();
    this.update({ status: 'reconnecting', synced: false });
    const delay = reconnectDelay(this.attempts++, this.random());
    this.cancelReconnect = this.scheduler.after(delay, () => this.connect());
  }

  /** The server decided: no further attempts, and nothing more may be edited. */
  private end(status: 'disconnected' | 'revoked') {
    this.detach();
    this.forgetOthers();
    this.update({ status, canEdit: false, synced: false });
  }

  private detach() {
    this.joined = false;
    this.stopHeartbeat?.();
    this.stopHeartbeat = undefined;
    this.cancelReconnect?.();
    this.cancelReconnect = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = null;
      socket.close(1000);
    }
  }

  /** Other people's cursors are stale once we cannot hear them any more. */
  private forgetOthers() {
    const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
    awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
  }

  private readonly onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    // Only editors send; a server that disagrees drops the update and says so.
    if (origin === this || !this.joined || this.snapshot.canEdit !== true) return;
    this.transmitFrame(FrameKind.Sync, (encoder) => syncProtocol.writeUpdate(encoder, update));
  };

  private readonly onAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin !== 'local' || !this.joined) return;
    const changed = [...added, ...updated, ...removed];
    this.transmitFrame(FrameKind.Awareness, (encoder) =>
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed),
      ),
    );
  };

  private transmitMessage(message: ClientMessage) {
    this.send(JSON.stringify(message));
  }

  private transmitFrame(kind: FrameKind, write: (encoder: encoding.Encoder) => void) {
    this.send(encodeFrame(this.documentId, kind, write));
  }

  private send(data: string | Uint8Array) {
    if (this.socket?.readyState === SOCKET_OPEN) this.socket.send(data);
  }

  private update(change: Partial<CollaborationSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}
