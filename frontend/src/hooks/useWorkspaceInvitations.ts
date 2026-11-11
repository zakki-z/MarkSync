import { useCallback } from 'react';
import { listWorkspaceInvitations } from '@/src/workspaceService';
import { useRemoteData } from './useRemoteData';

/** Only owners may list a workspace's invitations, so other roles skip the request. */
export function useWorkspaceInvitations(workspaceId: number, enabled: boolean) {
  return useRemoteData(
    useCallback(
      () => (enabled ? listWorkspaceInvitations(workspaceId) : Promise.resolve([])),
      [workspaceId, enabled],
    ),
  );
}
