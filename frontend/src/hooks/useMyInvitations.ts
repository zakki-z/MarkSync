import { queryKeys, staleTime } from '@/src/queries/keys';
import { listMyInvitations } from '@/src/workspaceService';
import { useServerQuery } from './useServerQuery';

export const useMyInvitations = () =>
  useServerQuery(queryKeys.myInvitations, listMyInvitations, staleTime.list);
