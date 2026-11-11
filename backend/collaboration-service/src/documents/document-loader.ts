import * as Y from 'yjs';
import type { DocumentPersistence } from '../persistence/document-persistence';
import { seedUpdate } from './yjs-content';

export type LoadedDocument = { doc: Y.Doc; pendingUpdates: number };

/**
 * Rebuilds a document from storage. A document that was never stored is seeded from the Markdown
 * the Document service holds, and the seed is stored before it is used, so a document is seeded
 * once: every later load finds Yjs state and ignores `seedMarkdown`. An empty document is seeded
 * too, which records that it exists.
 */
export async function loadDocument(
  persistence: DocumentPersistence,
  documentId: number,
  seedMarkdown: string,
): Promise<LoadedDocument> {
  const doc = new Y.Doc();
  const stored = await persistence.load(documentId);
  if (stored) {
    Y.applyUpdate(doc, stored.update);
    return { doc, pendingUpdates: stored.pendingUpdates };
  }
  const seed = seedUpdate(seedMarkdown);
  await persistence.append(documentId, seed);
  Y.applyUpdate(doc, seed);
  return { doc, pendingUpdates: 1 };
}
