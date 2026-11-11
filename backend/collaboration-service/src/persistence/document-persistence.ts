import * as Y from 'yjs';

/** A document's stored Yjs state, merged into one update. */
export type StoredDocument = {
  update: Uint8Array;
  /** Updates appended since the last compaction; the session compacts when this grows large. */
  pendingUpdates: number;
};

/**
 * Where Yjs state lives. Updates are appended and never rewritten; `compact` folds them into a
 * snapshot. The stored Yjs state, not any rendered text, is the source of truth for a document.
 * Implementations must keep an update that was appended while a compaction runs.
 */
export interface DocumentPersistence {
  /** The merged state, or null when nothing was ever stored (the document was never opened). */
  load(documentId: number): Promise<StoredDocument | null>;
  append(documentId: number, update: Uint8Array): Promise<void>;
  /** Folds the snapshot and every update appended so far into a new snapshot. */
  compact(documentId: number): Promise<void>;
}

/** Re-encodes updates through a Y.Doc, which drops the content of deleted text. */
export function compactState(updates: Uint8Array[]): Uint8Array {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  const state = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return state;
}
