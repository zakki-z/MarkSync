import { Binary, type Collection, type Db } from 'mongodb';
import * as Y from 'yjs';
import {
  compactState,
  type DocumentPersistence,
  type StoredDocument,
} from './document-persistence';

/** One appended Yjs update. `seq` is per document and strictly increasing. */
type UpdateRecord = { documentId: number; seq: number; update: Binary; createdAt: Date };
/** The compacted state of a document, covering every update up to and including `upToSeq`. */
type SnapshotRecord = { _id: number; state: Binary; upToSeq: number; updatedAt: Date };

const bytes = (binary: Binary) => new Uint8Array(binary.buffer);

/**
 * MongoDB storage in two collections, `yjs_updates` (append-only) and `yjs_snapshots` (one per
 * document). Compaction writes the snapshot before it deletes the folded updates, so a crash in
 * between only leaves updates that load applies a second time, which Yjs ignores.
 */
export class MongoDocumentPersistence implements DocumentPersistence {
  private constructor(
    private readonly updates: Collection<UpdateRecord>,
    private readonly snapshots: Collection<SnapshotRecord>,
  ) {}

  static async create(db: Db): Promise<MongoDocumentPersistence> {
    const updates = db.collection<UpdateRecord>('yjs_updates');
    // Two appends racing for the same seq cannot both succeed; the loser is retried by the caller.
    await updates.createIndex({ documentId: 1, seq: 1 }, { unique: true });
    return new MongoDocumentPersistence(updates, db.collection<SnapshotRecord>('yjs_snapshots'));
  }

  async load(documentId: number): Promise<StoredDocument | null> {
    const snapshot = await this.snapshots.findOne({ _id: documentId });
    const updates = await this.updatesAfter(documentId, snapshot?.upToSeq ?? 0);
    if (!snapshot && updates.length === 0) return null;
    const parts = [
      ...(snapshot ? [bytes(snapshot.state)] : []),
      ...updates.map((u) => bytes(u.update)),
    ];
    return { update: Y.mergeUpdates(parts), pendingUpdates: updates.length };
  }

  async append(documentId: number, update: Uint8Array): Promise<void> {
    const latest = await this.updates.find({ documentId }).sort({ seq: -1 }).limit(1).next();
    const snapshot = await this.snapshots.findOne({ _id: documentId });
    const seq = Math.max(latest?.seq ?? 0, snapshot?.upToSeq ?? 0) + 1;
    await this.updates.insertOne({
      documentId,
      seq,
      update: new Binary(update),
      createdAt: new Date(),
    });
  }

  async compact(documentId: number): Promise<void> {
    const snapshot = await this.snapshots.findOne({ _id: documentId });
    const updates = await this.updatesAfter(documentId, snapshot?.upToSeq ?? 0);
    const last = updates.at(-1);
    if (!last) return;
    const state = compactState([
      ...(snapshot ? [bytes(snapshot.state)] : []),
      ...updates.map((u) => bytes(u.update)),
    ]);
    await this.snapshots.replaceOne(
      { _id: documentId },
      { state: new Binary(state), upToSeq: last.seq, updatedAt: new Date() },
      { upsert: true },
    );
    await this.updates.deleteMany({ documentId, seq: { $lte: last.seq } });
  }

  private updatesAfter(documentId: number, seq: number) {
    return this.updates
      .find({ documentId, seq: { $gt: seq } })
      .sort({ seq: 1 })
      .toArray();
  }
}
