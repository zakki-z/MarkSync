import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { prefetchDocument, prefetchWorkspace } from '@/src/queries/prefetch';

/**
 * Stable handlers for onMouseEnter and onFocus of a link: they load the route and the data behind
 * it before the click, so the page can paint from the cache.
 */
export function usePrefetch() {
  const client = useQueryClient();
  const router = useRouter();
  return useMemo(
    () => ({
      document: (workspaceId: number, documentId: number) => {
        router.prefetch(`/w/${workspaceId}/d/${documentId}`);
        prefetchDocument(client, documentId);
      },
      workspace: (workspaceId: number) => {
        router.prefetch(`/w/${workspaceId}`);
        prefetchWorkspace(client, workspaceId);
      },
    }),
    [client, router],
  );
}
