import { listWorkspaces } from '@/src/workspaceService';
import { useRemoteData } from './useRemoteData';

export const useWorkspaces = () => useRemoteData(listWorkspaces);
