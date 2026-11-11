import { listMyInvitations } from '@/src/workspaceService';
import { useRemoteData } from './useRemoteData';

export const useMyInvitations = () => useRemoteData(listMyInvitations);
