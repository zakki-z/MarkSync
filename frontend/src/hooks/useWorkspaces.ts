import { queryKeys, staleTime } from '@/src/queries/keys';
import { listWorkspaces } from '@/src/workspaceService';
import { useServerQuery } from './useServerQuery';

export const useWorkspaces = () =>
  useServerQuery(queryKeys.workspaces, listWorkspaces, staleTime.list);
