import { useCallback } from 'react';
import { listMembers } from '@/src/workspaceService';
import { useRemoteData } from './useRemoteData';

export function useMembers(workspaceId: number) {
  return useRemoteData(useCallback(() => listMembers(workspaceId), [workspaceId]));
}
