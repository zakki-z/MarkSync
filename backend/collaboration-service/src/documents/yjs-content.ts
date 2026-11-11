import * as Y from 'yjs';

/** The shared type that holds a document's Markdown. */
export const CONTENT_FIELD = 'content';

/**
 * Every seed is written by this client id, so the same Markdown always produces byte-identical
 * structs. If two loaders ever seed the same document, merging their updates yields the text once
 * instead of twice. Editing clients get random ids and never use this one.
 */
const SEED_CLIENT_ID = 1;

export function markdownOf(doc: Y.Doc): string {
  return doc.getText(CONTENT_FIELD).toString();
}

export function seedUpdate(markdown: string): Uint8Array {
  const doc = new Y.Doc();
  doc.clientID = SEED_CLIENT_ID;
  doc.getText(CONTENT_FIELD).insert(0, markdown);
  const update = Y.encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
}
