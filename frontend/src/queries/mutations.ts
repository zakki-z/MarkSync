import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as documentService from '@/src/documentService';
import type { DocumentDTO, DocumentDraft } from '@/src/documentService';
import * as workspaceService from '@/src/workspaceService';
import type { Workspace } from '@/src/workspaceService';
import { queryKeys } from './keys';

type DocumentApi = Pick<
  typeof documentService,
  'createDocument' | 'updateDocument' | 'deleteDocument'
>;
type WorkspaceApi = Pick<typeof workspaceService, 'createWorkspace'>;

type Target = { id: number; workspaceId: number };
type ListContext = { previous?: DocumentDTO[] };

/**
 * Document writes with the cached lists kept in step with them. Updates and deletes change the
 * cached list before the server answers and put it back if the request fails; a create cannot be
 * shown early because the id belongs to the server. Every write ends by revalidating the list, so
 * the server stays the source of truth. Written against explicit `client` and `api` arguments so
 * tests can drive it without React.
 */
export function documentMutations(client: QueryClient, api: DocumentApi = documentService) {
  const patchList = (workspaceId: number, change: (documents: DocumentDTO[]) => DocumentDTO[]) =>
    client.setQueryData<DocumentDTO[]>(
      queryKeys.documents(workspaceId),
      (documents) => documents && change(documents),
    );

  /** Snapshots the list, applies the optimistic change and returns the snapshot for a rollback. */
  const applyOptimistically = async (
    workspaceId: number,
    change: (documents: DocumentDTO[]) => DocumentDTO[],
  ): Promise<ListContext> => {
    await client.cancelQueries({ queryKey: queryKeys.documents(workspaceId) });
    const previous = client.getQueryData<DocumentDTO[]>(queryKeys.documents(workspaceId));
    patchList(workspaceId, change);
    return { previous };
  };

  const rollback = (workspaceId: number, context?: ListContext) => {
    if (context?.previous) client.setQueryData(queryKeys.documents(workspaceId), context.previous);
  };

  const revalidateList = (workspaceId: number) =>
    client.invalidateQueries({ queryKey: queryKeys.documents(workspaceId) });

  return {
    create: {
      mutationFn: ({ workspaceId, draft }: { workspaceId: number; draft: DocumentDraft }) =>
        api.createDocument(workspaceId, draft),
      onSuccess: (created: DocumentDTO) => {
        patchList(created.workspaceId, (documents) => [
          created,
          ...documents.filter((document) => document.id !== created.id),
        ]);
        // The new document opens straight from the cache; the create response is complete.
        client.setQueryData(queryKeys.document(created.id), created);
      },
      onSettled: (_created: unknown, _error: unknown, { workspaceId }: { workspaceId: number }) =>
        revalidateList(workspaceId),
    },

    update: {
      mutationFn: ({ id, draft }: Target & { draft: DocumentDraft }) =>
        api.updateDocument(id, draft),
      onMutate: ({ id, workspaceId, draft }: Target & { draft: DocumentDraft }) =>
        applyOptimistically(workspaceId, (documents) =>
          documents.map((document) =>
            document.id === id
              ? {
                  ...document,
                  title: draft.title,
                  visibility: draft.visibility ?? document.visibility,
                }
              : document,
          ),
        ),
      onError: (_error: unknown, { workspaceId }: Target, context?: ListContext) =>
        rollback(workspaceId, context),
      onSuccess: (updated: DocumentDTO, { id }: Target) => {
        // The response carries the stored seed copy of the Markdown, not the live text: keep ours.
        client.setQueryData<DocumentDTO>(
          queryKeys.document(id),
          (cached) => cached && { ...updated, markdown: cached.markdown },
        );
      },
      onSettled: (_updated: unknown, _error: unknown, { workspaceId }: Target) =>
        revalidateList(workspaceId),
    },

    remove: {
      mutationFn: ({ id }: Target) => api.deleteDocument(id),
      onMutate: ({ id, workspaceId }: Target) =>
        applyOptimistically(workspaceId, (documents) =>
          documents.filter((document) => document.id !== id),
        ),
      onError: (_error: unknown, { workspaceId }: Target, context?: ListContext) =>
        rollback(workspaceId, context),
      // Not removed outright: the open page still observes it. Stale means it is refetched, and
      // answered with a 404, the next time anything asks for it.
      onSuccess: (_result: unknown, { id }: Target) =>
        client.invalidateQueries({ queryKey: queryKeys.document(id), refetchType: 'none' }),
      onSettled: (_result: unknown, _error: unknown, { workspaceId }: Target) =>
        revalidateList(workspaceId),
    },
  };
}

export function workspaceMutations(client: QueryClient, api: WorkspaceApi = workspaceService) {
  return {
    create: {
      mutationFn: (name: string) => api.createWorkspace(name),
      onSuccess: (created: Workspace) => {
        client.setQueryData<Workspace[]>(
          queryKeys.workspaces,
          (workspaces) => workspaces && [created, ...workspaces],
        );
      },
      onSettled: () => client.invalidateQueries({ queryKey: queryKeys.workspaces, exact: true }),
    },
  };
}

export const useCreateDocument = () => useMutation(documentMutations(useQueryClient()).create);
export const useUpdateDocument = () => useMutation(documentMutations(useQueryClient()).update);
export const useDeleteDocument = () => useMutation(documentMutations(useQueryClient()).remove);
export const useCreateWorkspace = () => useMutation(workspaceMutations(useQueryClient()).create);
