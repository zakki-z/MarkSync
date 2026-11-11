import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import type { Connection } from '../connection';
import { encodeFrame, FrameKind } from '../document-frames';
import { DocumentAwareness } from './document-awareness';
import type { DocumentPersistence } from '../persistence/document-persistence';

export type PersistenceOptions = {
  /** Quiet time after the last edit before the buffered updates are written. */
  debounceMs: number;
  /** Longest an edit may wait for a write while edits keep arriving. */
  maxWaitMs: number;
  /** First wait before a failed write is tried again; it doubles up to `MAX_RETRY_MS`. */
  retryMs: number;
  /** Updates appended since the last compaction that trigger the next one. */
  compactAfter: number;
};

export type ErrorReporter = (documentId: number, error: unknown) => void;

const MAX_RETRY_MS = 30_000;

const awarenessFrame = (documentId: number, update: Uint8Array) =>
  encodeFrame(documentId, FrameKind.Awareness, (encoder) =>
    encoding.writeVarUint8Array(encoder, update),
  );

type SessionDependencies = {
  persistence: DocumentPersistence;
  options: PersistenceOptions;
  report: ErrorReporter;
  /** Called after every successful flush, so the manager can evict a session nobody is in. */
  onFlushed: (session: DocumentSession) => void;
};

/**
 * One open document: its in-memory Y.Doc, the connections editing it and the buffer of updates not
 * yet stored. Updates are written in batches after a pause in editing, and a failed write stays
 * buffered and is retried until it succeeds, so the in-memory state is never ahead of storage for
 * longer than the retry takes.
 */
export class DocumentSession {
  private readonly members = new Map<Connection, { canEdit: boolean }>();
  private pending: Uint8Array[] = [];
  private updatesSinceCompaction: number;
  private failures = 0;
  private writes: Promise<void> = Promise.resolve();
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private maxWaitTimer?: ReturnType<typeof setTimeout>;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private readonly awareness: DocumentAwareness;

  constructor(
    readonly documentId: number,
    readonly doc: Y.Doc,
    pendingUpdates: number,
    private readonly dependencies: SessionDependencies,
  ) {
    this.updatesSinceCompaction = pendingUpdates;
    doc.on('update', this.onUpdate);
    this.awareness = new DocumentAwareness(doc, (update, origin) => {
      const frame = awarenessFrame(this.documentId, update);
      for (const connection of this.members.keys())
        if (connection !== origin) connection.sendBinary(frame);
    });
  }

  get hasMembers() {
    return this.members.size > 0;
  }

  addMember(connection: Connection, canEdit: boolean) {
    this.members.set(connection, { canEdit });
  }

  removeMember(connection: Connection) {
    this.members.delete(connection);
    this.awareness.release(connection);
  }

  /** Applies a role change; the connection is told what it may do now. */
  setCanEdit(connection: Connection, canEdit: boolean) {
    const member = this.members.get(connection);
    if (!member || member.canEdit === canEdit) return;
    member.canEdit = canEdit;
    this.announceAccess(connection, canEdit);
  }

  /**
   * Starts the sync handshake from the server's side: it asks for what it is missing and shows the
   * newcomer who else is here.
   */
  greet(connection: Connection) {
    connection.sendBinary(
      encodeFrame(this.documentId, FrameKind.Sync, (encoder) =>
        syncProtocol.writeSyncStep1(encoder, this.doc),
      ),
    );
    const others = this.awareness.snapshot();
    if (others) connection.sendBinary(awarenessFrame(this.documentId, others));
  }

  /** Cursor and selection updates; members who may only read can share theirs too. */
  receiveAwareness(connection: Connection, payload: Uint8Array) {
    if (this.members.has(connection)) this.awareness.receive(connection, payload);
  }

  /**
   * Handles one y-protocols sync message. Anyone who joined may ask for state (step 1), but only
   * editors may change the document: updates from anyone else are dropped, never applied. Throws
   * on a message that is not valid; nothing has been applied then.
   */
  receiveSync(connection: Connection, payload: Uint8Array) {
    const member = this.members.get(connection);
    if (!member) return;
    const decoder = decoding.createDecoder(payload);
    const type = decoding.readVarUint(decoder);
    if (type === syncProtocol.messageYjsSyncStep1) {
      this.replyToStateRequest(connection, decoder);
      return;
    }
    if (type !== syncProtocol.messageYjsSyncStep2 && type !== syncProtocol.messageYjsUpdate)
      throw new Error('Unknown sync message type');
    const update = decoding.readVarUint8Array(decoder);
    // y-protocols logs and swallows a malformed update, so check it first to be able to refuse it.
    Y.decodeUpdate(update);
    if (!member.canEdit) {
      this.announceAccess(connection, false);
      return;
    }
    Y.applyUpdate(this.doc, update, connection);
  }

  private replyToStateRequest(connection: Connection, decoder: decoding.Decoder) {
    const reply = encoding.createEncoder();
    syncProtocol.readSyncStep1(decoder, reply, this.doc);
    connection.sendBinary(
      encodeFrame(this.documentId, FrameKind.Sync, (encoder) =>
        encoding.writeUint8Array(encoder, encoding.toUint8Array(reply)),
      ),
    );
  }

  /** Writes everything buffered. Rejects if the write fails; a retry is already scheduled then. */
  flush(): Promise<void> {
    this.clearTimers();
    const run = this.writes.then(() => this.write());
    this.writes = run.catch(() => {});
    return run;
  }

  /** Stops the timers and releases the document. Buffered updates must be flushed first. */
  destroy() {
    this.destroyed = true;
    this.clearTimers();
    clearTimeout(this.retryTimer);
    this.doc.off('update', this.onUpdate);
    this.doc.destroy();
    this.members.clear();
  }

  /** Every change is stored and sent to the other members, whoever made it. */
  private readonly onUpdate = (update: Uint8Array, origin: unknown) => {
    this.buffer(update);
    const frame = encodeFrame(this.documentId, FrameKind.Sync, (encoder) =>
      syncProtocol.writeUpdate(encoder, update),
    );
    for (const connection of this.members.keys())
      if (connection !== origin) connection.sendBinary(frame);
  };

  private buffer(update: Uint8Array) {
    this.pending.push(update);
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(
      () => this.flushInBackground(),
      this.dependencies.options.debounceMs,
    );
    this.maxWaitTimer ??= setTimeout(
      () => this.flushInBackground(),
      this.dependencies.options.maxWaitMs,
    );
  }

  private announceAccess(connection: Connection, canEdit: boolean) {
    connection.send({ type: 'document-access', documentId: this.documentId, canEdit });
  }

  private flushInBackground() {
    // A failure was already reported and a retry scheduled by `write`.
    this.flush().catch(() => {});
  }

  private async write() {
    if (this.destroyed) return;
    if (this.pending.length > 0) {
      const batch = Y.mergeUpdates(this.pending);
      this.pending = [];
      try {
        await this.dependencies.persistence.append(this.documentId, batch);
      } catch (error) {
        // Keep the batch in front of anything buffered meanwhile and try again later.
        this.pending.unshift(batch);
        this.dependencies.report(this.documentId, error);
        this.scheduleRetry();
        throw error;
      }
      this.failures = 0;
      this.updatesSinceCompaction++;
      await this.compactIfDue();
    }
    this.dependencies.onFlushed(this);
  }

  private async compactIfDue() {
    if (this.updatesSinceCompaction < this.dependencies.options.compactAfter) return;
    try {
      await this.dependencies.persistence.compact(this.documentId);
      this.updatesSinceCompaction = 0;
    } catch (error) {
      // The updates are stored; compaction is only housekeeping and is tried again next flush.
      this.dependencies.report(this.documentId, error);
    }
  }

  private scheduleRetry() {
    const { retryMs } = this.dependencies.options;
    const delay = Math.min(MAX_RETRY_MS, retryMs * 2 ** this.failures++);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.flushInBackground(), delay);
  }

  private clearTimers() {
    clearTimeout(this.debounceTimer);
    clearTimeout(this.maxWaitTimer);
    this.maxWaitTimer = undefined;
  }
}
