import { useCallback } from 'react';
import { listDocuments } from '@/src/documentService';
import { useRemoteData } from './useRemoteData';

export function useWorkspaceDocuments(workspaceId: number) {
  return useRemoteData(useCallback(() => listDocuments(workspaceId), [workspaceId]));
}
