import { listDocuments } from '@/src/documentService';
import { queryKeys, staleTime } from '@/src/queries/keys';
import { useServerQuery } from './useServerQuery';

export function useWorkspaceDocuments(workspaceId: number) {
  return useServerQuery(
    queryKeys.documents(workspaceId),
    () => listDocuments(workspaceId),
    staleTime.list,
  );
}
