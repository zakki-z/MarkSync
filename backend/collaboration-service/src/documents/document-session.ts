import * as Y from 'yjs';
import type { Connection } from '../connection';
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

  constructor(
    readonly documentId: number,
    readonly doc: Y.Doc,
    pendingUpdates: number,
    private readonly dependencies: SessionDependencies,
  ) {
    this.updatesSinceCompaction = pendingUpdates;
    doc.on('update', this.buffer);
  }

  get hasMembers() {
    return this.members.size > 0;
  }

  addMember(connection: Connection, canEdit: boolean) {
    this.members.set(connection, { canEdit });
  }

  removeMember(connection: Connection) {
    this.members.delete(connection);
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
    this.doc.off('update', this.buffer);
    this.doc.destroy();
    this.members.clear();
  }

  private readonly buffer = (update: Uint8Array) => {
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
  };

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
