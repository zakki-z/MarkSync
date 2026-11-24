import type { QueryClient } from '@tanstack/react-query';
import { getDocument, listDocuments } from '@/src/documentService';
import { queryKeys, staleTime } from './keys';

/**
 * Warm-ups for a link the user is about to follow. They only fill the cache and load code; a
 * failure is ignored because the page makes the same request itself and shows its own error.
 * Data that is still fresh is not requested again.
 */
export function prefetchDocument(client: QueryClient, documentId: number) {
  void client.prefetchQuery({
    queryKey: queryKeys.document(documentId),
    queryFn: () => getDocument(documentId),
    staleTime: staleTime.document,
  });
  // The editor is a separate chunk (see DocumentEditor); start downloading it with the data.
  void import('@/src/components/CollaborativeEditor').catch(() => undefined);
}

export function prefetchWorkspace(client: QueryClient, workspaceId: number) {
  void client.prefetchQuery({
    queryKey: queryKeys.documents(workspaceId),
    queryFn: () => listDocuments(workspaceId),
    staleTime: staleTime.list,
  });
}
