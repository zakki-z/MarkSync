import { queryKeys, staleTime } from '@/src/queries/keys';
import { getMembership } from '@/src/workspaceService';
import { useServerQuery } from './useServerQuery';

export function useMembership(workspaceId: number) {
  return useServerQuery(
    queryKeys.membership(workspaceId),
    () => getMembership(workspaceId),
    staleTime.membership,
  );
}
