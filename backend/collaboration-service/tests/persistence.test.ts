import { afterAll, describe, expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';
import * as Y from 'yjs';
import type { DocumentPersistence } from '../src/persistence/document-persistence';
import { MongoDocumentPersistence } from '../src/persistence/mongo-document-persistence';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';

/** Edits a text and returns the update each edit produced. */
function edits(...steps: Array<(text: Y.Text) => void>) {
  const doc = new Y.Doc();
  const updates: Uint8Array[] = [];
  doc.on('update', (update: Uint8Array) => updates.push(update));
  for (const step of steps) step(doc.getText('content'));
  return { doc, updates };
}

const textOf = (update: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc.getText('content').toString();
};

type Database = { open(): Promise<DocumentPersistence>; close(): Promise<void> };

const databases: Array<[string, () => Promise<Database>]> = [
  [
    'in-memory fake',
    async () => {
      const shared = new InMemoryDocumentPersistence();
      return { open: async () => shared, close: async () => {} };
    },
  ],
];

// The Mongo adapter runs against a real server when one is configured (CI has none).
const mongoUrl = process.env.MONGODB_URL;
if (mongoUrl)
  databases.push([
    'MongoDB adapter',
    async () => {
      const client = await MongoClient.connect(mongoUrl);
      const db = client.db(`marksync_test_${crypto.randomUUID()}`);
      return {
        open: () => MongoDocumentPersistence.create(db),
        close: async () => {
          await db.dropDatabase();
          await client.close();
        },
      };
    },
  ]);

describe.each(databases)('DocumentPersistence: %s', (_name, createDatabase) => {
  const cleanups: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const cleanup of cleanups) await cleanup();
  });

  async function setup() {
    const database = await createDatabase();
    cleanups.push(database.close);
    return { persistence: await database.open(), reopen: database.open };
  }

  test('loads null for a document that was never stored', async () => {
    const { persistence } = await setup();
    expect(await persistence.load(1)).toBeNull();
  });

  test('appended updates load as one merged state', async () => {
    const { persistence } = await setup();
    const { updates } = edits(
      (t) => t.insert(0, 'Hello'),
      (t) => t.insert(5, ' world'),
    );
    for (const update of updates) await persistence.append(1, update);
    const stored = await persistence.load(1);
    expect(textOf(stored!.update)).toBe('Hello world');
    expect(stored!.pendingUpdates).toBe(2);
  });

  test('documents are stored independently', async () => {
    const { persistence } = await setup();
    await persistence.append(1, edits((t) => t.insert(0, 'one')).updates[0]!);
    await persistence.append(2, edits((t) => t.insert(0, 'two')).updates[0]!);
    expect(textOf((await persistence.load(1))!.update)).toBe('one');
    expect(textOf((await persistence.load(2))!.update)).toBe('two');
  });

  test('compaction keeps the text, folds the updates and drops deleted content', async () => {
    const { persistence } = await setup();
    const { updates } = edits(
      (t) => t.insert(0, 'x'.repeat(2000)),
      (t) => t.delete(0, 2000),
      (t) => t.insert(0, 'kept'),
    );
    for (const update of updates) await persistence.append(1, update);
    const before = await persistence.load(1);

    await persistence.compact(1);

    const after = await persistence.load(1);
    expect(textOf(after!.update)).toBe('kept');
    expect(after!.pendingUpdates).toBe(0);
    expect(after!.update.length).toBeLessThan(before!.update.length);
  });

  test('compacting twice, or with nothing to fold, changes nothing', async () => {
    const { persistence } = await setup();
    await persistence.compact(1);
    expect(await persistence.load(1)).toBeNull();
    await persistence.append(1, edits((t) => t.insert(0, 'a')).updates[0]!);
    await persistence.compact(1);
    await persistence.compact(1);
    expect(textOf((await persistence.load(1))!.update)).toBe('a');
  });

  test('updates appended after a compaction are kept and loaded with the snapshot', async () => {
    const { persistence } = await setup();
    const { doc, updates } = edits((t) => t.insert(0, 'one'));
    await persistence.append(1, updates[0]!);
    await persistence.compact(1);
    const next: Uint8Array[] = [];
    doc.on('update', (update: Uint8Array) => next.push(update));
    doc.getText('content').insert(3, ' two');
    await persistence.append(1, next[0]!);

    const stored = await persistence.load(1);
    expect(textOf(stored!.update)).toBe('one two');
    expect(stored!.pendingUpdates).toBe(1);
  });

  test('the state is identical after a reload, before and after compaction', async () => {
    const { persistence, reopen } = await setup();
    const { doc, updates } = edits(
      (t) => t.insert(0, 'Hello'),
      (t) => t.insert(5, ', there'),
      (t) => t.delete(0, 1),
    );
    for (const update of updates) await persistence.append(1, update);

    const reloaded = await (await reopen()).load(1);
    expect(textOf(reloaded!.update)).toBe(doc.getText('content').toString());

    await persistence.compact(1);
    const compacted = await (await reopen()).load(1);
    expect(textOf(compacted!.update)).toBe(doc.getText('content').toString());
    expect(stateVectorOf(compacted!.update)).toEqual(Y.encodeStateVector(doc));
  });
});

function stateVectorOf(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return Y.encodeStateVector(doc);
}
