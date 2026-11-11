import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import * as Y from 'yjs';
import { Connection } from '../src/connection';
import {
  DocumentSessionManager,
  type DocumentGrant,
} from '../src/documents/document-session-manager';
import type { PersistenceOptions } from '../src/documents/document-session';
import { markdownOf } from '../src/documents/yjs-content';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';
import { FakeTransport } from './support';

const OPTIONS: PersistenceOptions = {
  debounceMs: 1000,
  maxWaitMs: 5000,
  retryMs: 2000,
  compactAfter: 5,
};
const grant = (markdown = '', canEdit = true): DocumentGrant => ({ canEdit, markdown });

let counter = 0;
const connect = (userId = 1) =>
  new Connection(
    `d${++counter}`,
    { id: userId, displayName: `user${userId}` },
    `token${userId}`,
    new FakeTransport(),
    0,
  );

/** Lets queued promise callbacks (the fake storage is all microtasks) run. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

let persistence: InMemoryDocumentPersistence;
let errors: Array<[number, unknown]>;
let manager: DocumentSessionManager;

beforeEach(() => {
  jest.useFakeTimers();
  persistence = new InMemoryDocumentPersistence();
  errors = [];
  manager = new DocumentSessionManager(persistence, OPTIONS, (id, error) =>
    errors.push([id, error]),
  );
});
afterEach(() => jest.useRealTimers());

const type = (documentId: number, text: string) => {
  const content = manager.get(documentId)!.doc.getText('content');
  content.insert(content.length, text);
};

describe('loading and eviction', () => {
  test('the first join loads and seeds the session; the next join reuses it', async () => {
    const ada = connect(1);
    const bob = connect(2);
    const first = await manager.join(ada, 1, grant('# Seed'));
    const second = await manager.join(bob, 1, grant('# Seed'));
    expect(markdownOf(first!.doc)).toBe('# Seed');
    expect(second).toBe(first!);
    expect(persistence.appends).toBe(1);
  });

  test('joins that race while the document loads share one session and one seed', async () => {
    const [a, b] = await Promise.all([
      manager.join(connect(1), 1, grant('text')),
      manager.join(connect(2), 1, grant('text')),
    ]);
    expect(a).toBe(b!);
    expect(persistence.appends).toBe(1);
  });

  test('the session is evicted after the last connection leaves, once its edits are stored', async () => {
    const ada = connect(1);
    const bob = connect(2);
    await manager.join(ada, 1, grant('a'));
    await manager.join(bob, 1, grant('a'));
    type(1, 'b');

    await manager.leave(ada, 1);
    expect(manager.get(1)).toBeDefined();
    expect(persistence.appends).toBe(1);

    await manager.leave(bob, 1);
    expect(manager.get(1)).toBeUndefined();
    expect(persistence.appends).toBe(2);
    expect(markdownOf((await manager.join(connect(3), 1, grant('ignored')))!.doc)).toBe('ab');
  });

  test('leaving a document you never joined does nothing', async () => {
    await manager.leave(connect(1), 99);
    expect(manager.get(99)).toBeUndefined();
  });

  test('a connection that closes while the document loads is not added and the session is released', async () => {
    const ada = connect(1);
    const joining = manager.join(ada, 1, grant('x'));
    ada.markClosed();
    expect(await joining).toBeUndefined();
    await settle();
    expect(manager.get(1)).toBeUndefined();
    expect(ada.documents.size).toBe(0);
  });

  test('a join while the last leaver is being flushed keeps the session', async () => {
    const ada = connect(1);
    await manager.join(ada, 1, grant('a'));
    type(1, 'b');
    const leaving = manager.leave(ada, 1);
    const bob = connect(2);
    const session = await manager.join(bob, 1, grant(''));
    await leaving;
    expect(manager.get(1)).toBe(session!);
    expect(markdownOf(session!.doc)).toBe('ab');
  });

  test('leaveAll removes a connection from every document it joined', async () => {
    const ada = connect(1);
    await manager.join(ada, 1, grant('one'));
    await manager.join(ada, 2, grant('two'));
    await manager.leaveAll(ada);
    expect(manager.get(1)).toBeUndefined();
    expect(manager.get(2)).toBeUndefined();
    expect(ada.documents.size).toBe(0);
  });
});

describe('debounced persistence', () => {
  test('edits within the debounce window are written as one batch', async () => {
    await manager.join(connect(1), 1, grant(''));
    const seedWrites = persistence.appends;
    type(1, 'a');
    jest.advanceTimersByTime(900);
    type(1, 'b');
    jest.advanceTimersByTime(900);
    type(1, 'c');
    await settle();
    expect(persistence.appends).toBe(seedWrites);

    jest.advanceTimersByTime(1000);
    await settle();
    expect(persistence.appends).toBe(seedWrites + 1);
    const stored = new Y.Doc();
    Y.applyUpdate(stored, (await persistence.load(1))!.update);
    expect(markdownOf(stored)).toBe('abc');
  });

  test('continuous editing is still written once the maximum wait has passed', async () => {
    await manager.join(connect(1), 1, grant(''));
    const seedWrites = persistence.appends;
    for (let i = 0; i < 6; i++) {
      type(1, 'x');
      jest.advanceTimersByTime(900);
    }
    await settle();
    expect(persistence.appends).toBe(seedWrites + 1);
  });

  test('nothing is written when nothing changed', async () => {
    await manager.join(connect(1), 1, grant(''));
    const writes = persistence.appends;
    jest.advanceTimersByTime(60_000);
    await settle();
    expect(persistence.appends).toBe(writes);
  });

  test('updates are compacted after enough writes', async () => {
    await manager.join(connect(1), 1, grant(''));
    // The seed counts as one stored update, so the fifth update triggers the compaction.
    for (let i = 0; i < 3; i++) {
      type(1, 'x');
      jest.advanceTimersByTime(1000);
      await settle();
    }
    expect((await persistence.load(1))!.pendingUpdates).toBe(4);
    type(1, 'x');
    jest.advanceTimersByTime(1000);
    await settle();
    expect((await persistence.load(1))!.pendingUpdates).toBe(0);
  });
});

describe('failed writes', () => {
  test('a failed write is reported, kept and retried with growing delays', async () => {
    await manager.join(connect(1), 1, grant(''));
    persistence.failNext = 2;
    type(1, 'precious');
    jest.advanceTimersByTime(1000);
    await settle();
    expect(errors).toHaveLength(1);

    jest.advanceTimersByTime(1999);
    await settle();
    expect(errors).toHaveLength(1);
    jest.advanceTimersByTime(1);
    await settle();
    expect(errors).toHaveLength(2);

    jest.advanceTimersByTime(3999);
    await settle();
    expect(errors).toHaveLength(2);
    jest.advanceTimersByTime(1);
    await settle();
    expect(errors).toHaveLength(2);
    const reloaded = new DocumentSessionManager(persistence, OPTIONS, () => {});
    expect(await reloaded.markdownOf(1, '')).toBe('precious');
  });

  test('edits made while a write is failing are written together with it', async () => {
    await manager.join(connect(1), 1, grant(''));
    persistence.failNext = 1;
    type(1, 'one ');
    jest.advanceTimersByTime(1000);
    await settle();
    type(1, 'two');
    jest.advanceTimersByTime(1000);
    await settle();
    const reloaded = new DocumentSessionManager(persistence, OPTIONS, () => {});
    expect(await reloaded.markdownOf(1, '')).toBe('one two');
  });

  test('a session whose last write failed stays open and is evicted after a retry succeeds', async () => {
    const ada = connect(1);
    await manager.join(ada, 1, grant(''));
    persistence.failNext = 1;
    type(1, 'text');

    await manager.leave(ada, 1);
    expect(errors).toHaveLength(1);
    expect(manager.get(1)).toBeDefined();

    jest.advanceTimersByTime(2000);
    await settle();
    expect(manager.get(1)).toBeUndefined();
    expect(await manager.markdownOf(1, '')).toBe('text');
  });
});

describe('shutdown', () => {
  test('stores every open session and releases them', async () => {
    await manager.join(connect(1), 1, grant(''));
    await manager.join(connect(2), 2, grant(''));
    type(1, 'one');
    type(2, 'two');

    await manager.shutdown();

    expect(manager.get(1)).toBeUndefined();
    expect(manager.get(2)).toBeUndefined();
    const reloaded = new DocumentSessionManager(persistence, OPTIONS, () => {});
    expect(await reloaded.markdownOf(1, '')).toBe('one');
    expect(await reloaded.markdownOf(2, '')).toBe('two');
  });

  test('a failure during shutdown is reported', async () => {
    await manager.join(connect(1), 1, grant(''));
    persistence.failNext = 1;
    type(1, 'text');
    await manager.shutdown();
    expect(errors).toHaveLength(1);
  });
});

describe('reading Markdown', () => {
  test('reads the open session, then stored state, and falls back to the seed without storing it', async () => {
    expect(await manager.markdownOf(1, 'from the Document service')).toBe(
      'from the Document service',
    );
    expect(await persistence.load(1)).toBeNull();

    const ada = connect(1);
    await manager.join(ada, 1, grant('seed'));
    type(1, ' live');
    expect(await manager.markdownOf(1, 'seed')).toBe('seed live');

    await manager.leave(ada, 1);
    expect(await manager.markdownOf(1, 'stale')).toBe('seed live');
  });
});
