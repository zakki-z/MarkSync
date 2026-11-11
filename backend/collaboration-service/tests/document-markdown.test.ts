import { afterEach, describe, expect, test } from 'bun:test';
import { createApp } from '../src/app';
import { FakeAccess, FakeDocumentAccess } from './support';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';
import { SyncPeer } from './sync-peer';

const DOC = 3;
const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.stop()));
});

function setup() {
  const documentAccess = new FakeDocumentAccess();
  const app = createApp({
    access: new FakeAccess(),
    documentAccess,
    persistence: new InMemoryDocumentPersistence(),
    persistenceOptions: { debounceMs: 10, maxWaitMs: 50, retryMs: 10, compactAfter: 100 },
  });
  apps.push(app);
  return { app, documentAccess };
}

describe('the derived Markdown view', () => {
  test('a document nobody opened returns the Document service text without storing anything', async () => {
    const { app, documentAccess } = setup();
    documentAccess.set('t', DOC, { status: 'granted', canEdit: true, markdown: '# Stored' });
    expect(await app.markdown.read('t', DOC)).toEqual({ status: 'granted', markdown: '# Stored' });
    expect(app.documents.get(DOC)).toBeUndefined();
  });

  test('an open document returns the live text, not the stale stored copy', async () => {
    const { app, documentAccess } = setup();
    documentAccess.set('token1', DOC, { status: 'granted', canEdit: true, markdown: 'old' });
    documentAccess.set(undefined, DOC, { status: 'granted', canEdit: false, markdown: 'old' });
    const ada = new SyncPeer(app, 1, DOC);
    await ada.join();
    ada.text.insert(3, ' and new');
    await ada.settle();

    // An anonymous visitor of a public document reads the live text too.
    expect(await app.markdown.read(undefined, DOC)).toEqual({
      status: 'granted',
      markdown: 'old and new',
    });
  });

  test('text survives the last editor leaving', async () => {
    const { app, documentAccess } = setup();
    documentAccess.set('token1', DOC, { status: 'granted', canEdit: true, markdown: 'old' });
    const ada = new SyncPeer(app, 1, DOC);
    await ada.join();
    ada.text.insert(3, '!');
    await ada.settle();
    await app.documents.leave(ada.connection, DOC);
    expect(await app.markdown.read('token1', DOC)).toEqual({ status: 'granted', markdown: 'old!' });
  });

  test('refusals from the Document service are passed on and nothing is read', async () => {
    const { app, documentAccess } = setup();
    documentAccess.set('eve', DOC, { status: 'denied' });
    documentAccess.set(undefined, DOC, { status: 'unauthenticated' });
    documentAccess.set('slow', DOC, { status: 'unavailable' });
    expect(await app.markdown.read('eve', DOC)).toEqual({ status: 'denied' });
    expect(await app.markdown.read(undefined, DOC)).toEqual({ status: 'unauthenticated' });
    expect(await app.markdown.read('slow', DOC)).toEqual({ status: 'unavailable' });
  });
});
