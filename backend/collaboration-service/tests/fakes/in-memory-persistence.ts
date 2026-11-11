import * as Y from 'yjs';
import {
  compactState,
  type DocumentPersistence,
  type StoredDocument,
} from '../../src/persistence/document-persistence';

type Stored = { snapshot?: Uint8Array; updates: Uint8Array[] };

/** The same behaviour as the Mongo adapter, in memory. Share one instance to model a database. */
export class InMemoryDocumentPersistence implements DocumentPersistence {
  private readonly documents = new Map<number, Stored>();
  /** Test hooks: make the next calls fail, and count what was written. */
  failNext = 0;
  appends = 0;

  async load(documentId: number): Promise<StoredDocument | null> {
    const stored = this.documents.get(documentId);
    if (!stored) return null;
    const parts = [...(stored.snapshot ? [stored.snapshot] : []), ...stored.updates];
    return { update: Y.mergeUpdates(parts), pendingUpdates: stored.updates.length };
  }

  async append(documentId: number, update: Uint8Array): Promise<void> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('database unavailable');
    }
    const stored = this.documents.get(documentId) ?? { updates: [] };
    stored.updates.push(update);
    this.documents.set(documentId, stored);
    this.appends++;
  }

  async compact(documentId: number): Promise<void> {
    const stored = this.documents.get(documentId);
    if (!stored || stored.updates.length === 0) return;
    const folded = stored.updates.length;
    const parts = [...(stored.snapshot ? [stored.snapshot] : []), ...stored.updates];
    stored.snapshot = compactState(parts);
    stored.updates.splice(0, folded);
  }
}
