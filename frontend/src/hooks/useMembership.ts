import { useCallback } from 'react';
import { getMembership } from '@/src/workspaceService';
import { useRemoteData } from './useRemoteData';

export function useMembership(workspaceId: number) {
  return useRemoteData(useCallback(() => getMembership(workspaceId), [workspaceId]));
}
