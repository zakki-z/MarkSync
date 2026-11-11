import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { loadDocument } from '../src/documents/document-loader';
import { markdownOf, seedUpdate } from '../src/documents/yjs-content';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';

describe('seeding existing content', () => {
  test('a document opened for the first time is seeded from its existing Markdown', async () => {
    const persistence = new InMemoryDocumentPersistence();
    const { doc } = await loadDocument(persistence, 1, '# Title\n\nExisting text.');
    expect(markdownOf(doc)).toBe('# Title\n\nExisting text.');
    expect(persistence.appends).toBe(1);
  });

  test('an empty document is seeded too, so it counts as stored', async () => {
    const persistence = new InMemoryDocumentPersistence();
    const { doc } = await loadDocument(persistence, 1, '');
    expect(markdownOf(doc)).toBe('');
    expect(await persistence.load(1)).not.toBeNull();
  });

  test('opening again loads the stored state and ignores the Markdown passed in', async () => {
    const persistence = new InMemoryDocumentPersistence();
    await loadDocument(persistence, 1, 'original');
    const second = await loadDocument(persistence, 1, 'stale copy from the Document service');
    expect(markdownOf(second.doc)).toBe('original');
    expect(persistence.appends).toBe(1);
  });

  test('later edits survive and are not replaced by the seed', async () => {
    const persistence = new InMemoryDocumentPersistence();
    const first = await loadDocument(persistence, 1, 'seed');
    first.doc.on('update', (update: Uint8Array) => void persistence.append(1, update));
    first.doc.getText('content').insert(4, ' edited');
    await Promise.resolve();

    const reopened = await loadDocument(persistence, 1, 'seed');
    expect(markdownOf(reopened.doc)).toBe('seed edited');
  });

  test('seeding twice, as two racing loaders would, does not duplicate the text', async () => {
    const persistence = new InMemoryDocumentPersistence();
    await Promise.all([
      loadDocument(persistence, 1, 'Same text'),
      loadDocument(persistence, 1, 'Same text'),
    ]);
    const reopened = await loadDocument(persistence, 1, 'Same text');
    expect(markdownOf(reopened.doc)).toBe('Same text');
  });

  test('the seed is identical every time and merges with itself without change', () => {
    expect(seedUpdate('abc')).toEqual(seedUpdate('abc'));
    const doc = new Y.Doc();
    Y.applyUpdate(doc, seedUpdate('abc'));
    Y.applyUpdate(doc, seedUpdate('abc'));
    expect(markdownOf(doc)).toBe('abc');
  });

  test('characters outside the basic plane and line endings are preserved', async () => {
    const persistence = new InMemoryDocumentPersistence();
    const text = 'emoji 🎉 and\r\nCRLF and ünïcode';
    await loadDocument(persistence, 1, text);
    expect(markdownOf((await loadDocument(persistence, 1, '')).doc)).toBe(text);
  });

  test('documents are seeded independently', async () => {
    const persistence = new InMemoryDocumentPersistence();
    await loadDocument(persistence, 1, 'one');
    const two = await loadDocument(persistence, 2, 'two');
    expect(markdownOf(two.doc)).toBe('two');
  });
});
