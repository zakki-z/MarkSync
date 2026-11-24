import { queryKeys, staleTime } from '@/src/queries/keys';
import { listMembers } from '@/src/workspaceService';
import { useServerQuery } from './useServerQuery';

export function useMembers(workspaceId: number) {
  return useServerQuery(
    queryKeys.members(workspaceId),
    () => listMembers(workspaceId),
    staleTime.list,
  );
}
