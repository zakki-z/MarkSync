import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { expect, test } from '@playwright/test';
import type { DocumentDTO } from '../src/documentService';
import { queryKeys } from '../src/queries/keys';
import { documentMutations, workspaceMutations } from '../src/queries/mutations';
import type { Workspace } from '../src/workspaceService';

const doc = (id: number, overrides: Partial<DocumentDTO> = {}): DocumentDTO => ({
  id,
  workspaceId: 1,
  title: `Document ${id}`,
  authorId: '7',
  markdown: '',
  visibility: 'PRIVATE',
  canEdit: true,
  createdAt: '2026-10-27T19:00:00Z',
  updatedAt: '2026-10-27T19:00:00Z',
  ...overrides,
});

/** A promise the test settles by hand, to look at the cache while a request is in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const listOf = (client: QueryClient) =>
  client.getQueryData<DocumentDTO[]>(queryKeys.documents(1))?.map((d) => `${d.id}:${d.title}`);

function setup() {
  const client = new QueryClient();
  client.setQueryData(queryKeys.documents(1), [doc(1), doc(2), doc(3)]);
  return client;
}

/** The api calls the mutation under test makes; unused ones fail loudly. */
const unused = () => Promise.reject(new Error('unexpected call'));
const api = (overrides: Record<string, unknown>) =>
  ({
    createDocument: unused,
    updateDocument: unused,
    deleteDocument: unused,
    ...overrides,
  }) as never;

test.describe('document mutations', () => {
  test('a rename shows in the cached list before the server answers', async () => {
    const client = setup();
    const request = deferred<DocumentDTO>();
    const options = documentMutations(
      client,
      api({ updateDocument: () => request.promise }),
    ).update;
    const pending = new MutationObserver(client, options).mutate({
      id: 2,
      workspaceId: 1,
      draft: { title: 'Renamed', visibility: 'PUBLIC' },
    });

    await expect.poll(() => listOf(client)).toEqual(['1:Document 1', '2:Renamed', '3:Document 3']);
    expect(client.getQueryData<DocumentDTO[]>(queryKeys.documents(1))?.[1].visibility).toBe(
      'PUBLIC',
    );

    request.resolve(doc(2, { title: 'Renamed' }));
    await pending;
  });

  test('a failed rename puts the list back and rejects', async () => {
    const client = setup();
    const options = documentMutations(
      client,
      api({ updateDocument: () => Promise.reject(new Error('Forbidden')) }),
    ).update;
    await expect(
      new MutationObserver(client, options).mutate({
        id: 2,
        workspaceId: 1,
        draft: { title: 'Renamed' },
      }),
    ).rejects.toThrow('Forbidden');
    expect(listOf(client)).toEqual(['1:Document 1', '2:Document 2', '3:Document 3']);
  });

  test('a saved rename keeps the live Markdown in the cached document', async () => {
    const client = setup();
    client.setQueryData(queryKeys.document(2), doc(2, { markdown: 'live text' }));
    const options = documentMutations(
      client,
      api({
        updateDocument: () => Promise.resolve(doc(2, { title: 'Renamed', markdown: 'seed' })),
      }),
    ).update;
    await new MutationObserver(client, options).mutate({
      id: 2,
      workspaceId: 1,
      draft: { title: 'Renamed' },
    });
    const cached = client.getQueryData<DocumentDTO>(queryKeys.document(2));
    expect(cached?.title).toBe('Renamed');
    expect(cached?.markdown).toBe('live text');
  });

  test('a delete leaves the cached list at once and is undone when it fails', async () => {
    const client = setup();
    const request = deferred<void>();
    const options = documentMutations(
      client,
      api({ deleteDocument: () => request.promise }),
    ).remove;
    const pending = new MutationObserver(client, options).mutate({ id: 2, workspaceId: 1 });
    await expect.poll(() => listOf(client)).toEqual(['1:Document 1', '3:Document 3']);

    request.reject(new Error('Not allowed'));
    await expect(pending).rejects.toThrow('Not allowed');
    expect(listOf(client)).toEqual(['1:Document 1', '2:Document 2', '3:Document 3']);
  });

  test('a delete marks the cached document stale without dropping it', async () => {
    const client = setup();
    client.setQueryData(queryKeys.document(2), doc(2));
    const options = documentMutations(
      client,
      api({ deleteDocument: () => Promise.resolve() }),
    ).remove;
    await new MutationObserver(client, options).mutate({ id: 2, workspaceId: 1 });
    expect(client.getQueryState(queryKeys.document(2))?.isInvalidated).toBe(true);
    expect(client.getQueryData(queryKeys.document(2))).toBeDefined();
  });

  test('a created document goes first in the list and opens from the cache', async () => {
    const client = setup();
    const created = doc(9, { title: 'Untitled document' });
    const options = documentMutations(
      client,
      api({ createDocument: () => Promise.resolve(created) }),
    ).create;
    await new MutationObserver(client, options).mutate({
      workspaceId: 1,
      draft: { title: 'Untitled document', markdown: '' },
    });
    expect(listOf(client)).toEqual([
      '9:Untitled document',
      '1:Document 1',
      '2:Document 2',
      '3:Document 3',
    ]);
    expect(client.getQueryData(queryKeys.document(9))).toEqual(created);
  });

  test('a write to a list that was never loaded does not invent one', async () => {
    const client = new QueryClient();
    const options = documentMutations(
      client,
      api({ createDocument: () => Promise.resolve(doc(9)) }),
    ).create;
    await new MutationObserver(client, options).mutate({ workspaceId: 1, draft: { title: 'x' } });
    expect(client.getQueryData(queryKeys.documents(1))).toBeUndefined();
  });

  test('a created workspace goes first in the sidebar list', async () => {
    const client = new QueryClient();
    const existing: Workspace = { id: 1, name: 'Personal', visibility: 'PRIVATE', ownerId: '7' };
    client.setQueryData(queryKeys.workspaces, [existing]);
    const created: Workspace = { id: 2, name: 'Team', visibility: 'PRIVATE', ownerId: '7' };
    const options = workspaceMutations(client, {
      createWorkspace: () => Promise.resolve(created),
    }).create;
    await new MutationObserver(client, options).mutate('Team');
    expect(client.getQueryData<Workspace[]>(queryKeys.workspaces)?.map((w) => w.name)).toEqual([
      'Team',
      'Personal',
    ]);
  });
});
