import { queryKeys, staleTime } from '@/src/queries/keys';
import { listWorkspaceInvitations } from '@/src/workspaceService';
import { useServerQuery } from './useServerQuery';

/** Only owners may list a workspace's invitations, so other roles skip the request. */
export function useWorkspaceInvitations(workspaceId: number, enabled: boolean) {
  return useServerQuery(
    queryKeys.workspaceInvitations(workspaceId, enabled),
    () => (enabled ? listWorkspaceInvitations(workspaceId) : Promise.resolve([])),
    staleTime.list,
  );
}
