import { afterEach, describe, expect, test } from 'bun:test';
import { MongoClient } from 'mongodb';
import * as Y from 'yjs';
import { createApp } from '../src/app';
import { AuthServiceAuthenticator } from '../src/connection-authenticator';
import { HttpDocumentAccessChecker } from '../src/document-access';
import { markdownOf } from '../src/documents/yjs-content';
import type { DocumentPersistence } from '../src/persistence/document-persistence';
import { MongoDocumentPersistence } from '../src/persistence/mongo-document-persistence';
import { startServer } from '../src/server';
import { HttpWorkspaceAccessChecker } from '../src/workspace-access';
import { InMemoryDocumentPersistence } from './fakes/in-memory-persistence';
import { CollabClient, eventually, ORIGIN } from './ws-client';

const DOC = 11;
const TOKENS = { ada: 'token-ada', bob: 'token-bob', cy: 'token-cy', vera: 'token-vera' } as const;

/** Stands in for the Auth and Document services. */
const accounts: Record<string, { id: number; username: string; canEdit: boolean }> = {
  'token-ada': { id: 1, username: 'ada', canEdit: true },
  'token-bob': { id: 2, username: 'bob', canEdit: true },
  'token-cy': { id: 3, username: 'cy', canEdit: true },
  'token-vera': { id: 4, username: 'vera', canEdit: false },
};
let storedMarkdown = '';
const upstream = Bun.serve({
  port: 0,
  fetch(request) {
    const { pathname } = new URL(request.url);
    const token = request.headers.get('authorization')?.slice(7) ?? '';
    const account = accounts[token];
    if (pathname === '/auth/me')
      return account ? Response.json(account) : new Response(null, { status: 401 });
    if (pathname !== `/api/documents/${DOC}`) return new Response(null, { status: 404 });
    if (!account) return new Response(null, { status: token ? 401 : 403 });
    return Response.json({ id: DOC, canEdit: account.canEdit, markdown: storedMarkdown });
  },
});

type Database = { persistence: () => Promise<DocumentPersistence>; close: () => Promise<void> };
const databases: Array<[string, () => Promise<Database>]> = [
  [
    'in-memory fake',
    async () => {
      const shared = new InMemoryDocumentPersistence();
      return { persistence: async () => shared, close: async () => {} };
    },
  ],
];
const mongoUrl = process.env.MONGODB_URL;
if (mongoUrl)
  databases.push([
    'MongoDB',
    async () => {
      const client = await MongoClient.connect(mongoUrl);
      const db = client.db(`marksync_test_${crypto.randomUUID()}`);
      return {
        persistence: () => MongoDocumentPersistence.create(db),
        close: async () => {
          await db.dropDatabase();
          await client.close();
        },
      };
    },
  ]);

type Running = { stop(): Promise<void>; port: number; app: ReturnType<typeof createApp> };
const servers: Running[] = [];
const clients: CollabClient[] = [];
const cleanups: Array<() => Promise<void>> = [];

async function startOn(
  persistence: DocumentPersistence,
  reportError: () => void = () => {},
): Promise<Running> {
  const app = createApp({
    access: new HttpWorkspaceAccessChecker(upstream.url.origin, 1000),
    documentAccess: new HttpDocumentAccessChecker(upstream.url.origin, 1000),
    persistence,
    persistenceOptions: { debounceMs: 20, maxWaitMs: 100, retryMs: 20, compactAfter: 25 },
    reportError,
  });
  const instance = startServer({
    port: 0,
    origins: [ORIGIN],
    authenticator: new AuthServiceAuthenticator(upstream.url.origin, 1000),
    app,
  });
  const running = { app, port: instance.server.port!, stop: () => instance.stop() };
  servers.push(running);
  return running;
}

const client = (server: Running, who: keyof typeof TOKENS) => {
  const created = new CollabClient(server.port, TOKENS[who], DOC);
  clients.push(created);
  return created;
};

afterEach(async () => {
  storedMarkdown = '';
  await Promise.all(clients.splice(0).map((c) => c.disconnect()));
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** Deterministic pseudo-random numbers, so a failing run can be repeated exactly. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allEqual = (...group: CollabClient[]) => group.every((c) => c.value === group[0]!.value);

describe.each(databases)('collaborative editing end to end (%s)', (_name, createDatabase) => {
  async function setup() {
    const database = await createDatabase();
    cleanups.push(database.close);
    const persistence = await database.persistence();
    return { database, persistence, server: await startOn(persistence) };
  }

  test('concurrent edits at the same position converge on every client', async () => {
    const { server } = await setup();
    const [ada, bob, cy] = [client(server, 'ada'), client(server, 'bob'), client(server, 'cy')];
    await Promise.all([ada.connect(), bob.connect(), cy.connect()]);

    const markers: string[] = [];
    for (let round = 0; round < 20; round++)
      for (const [who, typist] of [
        ['a', ada],
        ['b', bob],
        ['c', cy],
      ] as const) {
        const marker = `${who}${round};`;
        markers.push(marker);
        typist.edit((t) => t.insert(0, marker));
      }

    const length = markers.join('').length;
    await eventually(() => ada.value.length === length && allEqual(ada, bob, cy), 'convergence');
    for (const marker of markers) expect(ada.value.split(marker)).toHaveLength(2);
    await eventually(
      () => markdownOf(server.app.documents.get(DOC)!.doc) === ada.value,
      'the server to hold the same text',
    );
  });

  test('no update is lost when many clients type at random positions at once', async () => {
    const { server } = await setup();
    const group = [client(server, 'ada'), client(server, 'bob'), client(server, 'cy')];
    await Promise.all(group.map((c) => c.connect()));
    const dice = random(42);
    const expectedMarkers: string[] = [];

    for (let step = 0; step < 150; step++) {
      const typist = group[Math.floor(dice() * group.length)]!;
      // One character per edit, so a later insert can never split an earlier marker.
      const marker = String.fromCodePoint(0x4e00 + step);
      typist.edit((t) => t.insert(Math.floor(dice() * (t.length + 1)), marker));
      expectedMarkers.push(marker);
      if (step % 7 === 0) await Bun.sleep(1);
    }

    await eventually(
      () => expectedMarkers.every((m) => group[0]!.value.includes(m)) && allEqual(...group),
      'every edit on every client',
    );
    const text = group[0]!.value;
    for (const marker of expectedMarkers) expect(text.split(marker)).toHaveLength(2);
  });

  test('edits made while offline are merged on reconnect, once and without losing others', async () => {
    const { server } = await setup();
    storedMarkdown = 'Start. ';
    const [ada, bob] = [client(server, 'ada'), client(server, 'bob')];
    await ada.connect();
    await bob.connect();
    expect(bob.value).toBe('Start. ');

    await bob.disconnect();
    bob.edit((t) => t.insert(t.length, 'bob offline 1. '));
    bob.edit((t) => t.insert(0, '[bob head] '));
    ada.edit((t) => t.insert(t.length, 'ada online. '));
    await eventually(
      () => markdownOf(server.app.documents.get(DOC)!.doc).includes('ada online. '),
      'the server to receive the online edit',
    );

    await bob.connect();
    await eventually(
      () => allEqual(ada, bob) && ada.value.includes('bob offline 1. '),
      'the merge',
    );

    for (const part of ['Start. ', 'bob offline 1. ', '[bob head] ', 'ada online. '])
      expect(ada.value.split(part)).toHaveLength(2);
  });

  test('a client that reconnects repeatedly never duplicates its text', async () => {
    const { server } = await setup();
    const [ada, bob] = [client(server, 'ada'), client(server, 'bob')];
    await ada.connect();
    for (let i = 0; i < 3; i++) {
      await bob.connect();
      bob.edit((t) => t.insert(t.length, `round${i} `));
      await eventually(() => ada.value.includes(`round${i} `), 'the edit to arrive');
      await bob.disconnect();
    }
    await bob.connect();
    await eventually(() => allEqual(ada, bob), 'convergence');
    expect(ada.value).toBe('round0 round1 round2 ');
  });

  test('saved changes survive a restart of the service', async () => {
    const { database, server } = await setup();
    storedMarkdown = '# Existing\n';
    const [ada, bob] = [client(server, 'ada'), client(server, 'bob')];
    await Promise.all([ada.connect(), bob.connect()]);
    ada.edit((t) => t.insert(t.length, 'written by ada\n'));
    bob.edit((t) => t.insert(t.length, 'written by bob\n'));
    await eventually(
      () => allEqual(ada, bob) && ada.value.includes('ada') && ada.value.includes('bob'),
      'both edits',
    );
    const before = ada.value;

    await Promise.all([ada.disconnect(), bob.disconnect()]);
    await server.stop();
    servers.splice(servers.indexOf(server), 1);

    // A new instance on the same database; the Document service's copy is stale on purpose.
    storedMarkdown = 'stale seed that must be ignored';
    const restarted = await startOn(await database.persistence());
    const reader = client(restarted, 'cy');
    await reader.connect();
    expect(reader.value).toBe(before);
  });

  test('clients that stayed connected through a restart reconnect without duplicating text', async () => {
    const { database, server } = await setup();
    const [ada, bob] = [client(server, 'ada'), client(server, 'bob')];
    await Promise.all([ada.connect(), bob.connect()]);
    ada.edit((t) => t.insert(0, 'kept '));
    await eventually(() => bob.value === 'kept ', 'the edit');

    await server.stop();
    servers.splice(servers.indexOf(server), 1);
    await eventually(() => ada.closeCode !== undefined && bob.closeCode !== undefined, 'the close');
    ada.edit((t) => t.insert(t.length, 'during outage '));

    const restarted = await startOn(await database.persistence());
    for (const c of [ada, bob]) c.port = restarted.port;
    await Promise.all([ada.connect(), bob.connect()]);
    await eventually(() => allEqual(ada, bob) && ada.value.includes('during outage '), 'merge');
    expect(ada.value).toBe('kept during outage ');
  });

  test('a viewer reads live edits but cannot change the document, even with forged updates', async () => {
    const { server } = await setup();
    const [ada, vera] = [client(server, 'ada'), client(server, 'vera')];
    await Promise.all([ada.connect(), vera.connect()]);
    expect(vera.canEdit).toBe(false);

    ada.edit((t) => t.insert(0, 'official'));
    await eventually(() => vera.value === 'official', 'the viewer to see the edit');

    vera.edit((t) => t.insert(0, 'FORGED '));
    await Bun.sleep(100);
    expect(ada.value).toBe('official');
    expect(markdownOf(server.app.documents.get(DOC)!.doc)).toBe('official');
  });

  test('opening a document with existing content from several clients at once seeds it once', async () => {
    const { server } = await setup();
    storedMarkdown = '# Title\n\nExisting body.\n';
    const group = [client(server, 'ada'), client(server, 'bob'), client(server, 'cy')];
    await Promise.all(group.map((c) => c.connect()));
    for (const c of group) expect(c.value).toBe('# Title\n\nExisting body.\n');
  });

  test('a large document is transferred in full on join', async () => {
    const { server } = await setup();
    storedMarkdown = 'line of text\n'.repeat(60_000);
    const ada = client(server, 'ada');
    await ada.connect();
    expect(ada.value.length).toBe(storedMarkdown.length);
    ada.edit((t) => t.insert(0, 'new top\n'));
    const bob = client(server, 'bob');
    await bob.connect();
    await eventually(() => bob.value.startsWith('new top\n'), 'the edit on the large document');
  });

  test('the Markdown endpoint serves the live text to authorized readers only', async () => {
    const { server } = await setup();
    storedMarkdown = 'stale';
    const ada = client(server, 'ada');
    await ada.connect();
    ada.edit((t) => t.insert(t.length, ' and live'));
    await eventually(
      () => markdownOf(server.app.documents.get(DOC)!.doc) === 'stale and live',
      'edit',
    );
    const url = `http://localhost:${server.port}/documents/${DOC}/markdown`;
    const get = (headers: Record<string, string> = {}, path = url) => fetch(path, { headers });

    const ok = await get({ Authorization: `Bearer ${TOKENS.vera}` });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('stale and live');
    expect((await get()).status).toBe(403);
    expect((await get({ Authorization: 'Bearer nobody' })).status).toBe(401);
    expect((await fetch(url, { method: 'POST' })).status).toBe(405);
    expect((await get({}, `http://localhost:${server.port}/documents/abc/markdown`)).status).toBe(
      404,
    );
  });
});

describe('recovery after the service could not store an edit', () => {
  test('clients that still hold the edit restore it when they reconnect', async () => {
    const persistence = new InMemoryDocumentPersistence();
    const failures: unknown[] = [];
    const server = await startOn(persistence, () => failures.push(1));
    const ada = client(server, 'ada');
    await ada.connect();
    ada.edit((t) => t.insert(0, 'stored. '));
    await eventually(() => persistence.appends >= 2, 'the edit to be stored');

    // The database goes down; the next edit stays in memory and the service then stops.
    persistence.failNext = 1000;
    ada.edit((t) => t.insert(t.length, 'unsaved. '));
    await eventually(() => failures.length > 0, 'the failed write to be reported');
    await server.stop();
    servers.splice(servers.indexOf(server), 1);
    persistence.failNext = 0;
    expect(markdownOf(await persistence.load(DOC).then((s) => decode(s!.update)))).toBe('stored. ');

    const restarted = await startOn(persistence);
    ada.port = restarted.port;
    await eventually(() => ada.closeCode !== undefined, 'the old connection to end');
    await ada.connect();
    await eventually(
      () => markdownOf(restarted.app.documents.get(DOC)!.doc) === 'stored. unsaved. ',
      'the unsaved edit to be restored',
    );
  });
});

function decode(update: Uint8Array) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return doc;
}
