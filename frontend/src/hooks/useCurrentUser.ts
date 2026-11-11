import { getCurrentUser } from '@/src/authService';
import { useRemoteData } from './useRemoteData';

/** `user` is undefined for anonymous visitors, which is valid on public documents. */
export function useCurrentUser() {
  const { data, loading } = useRemoteData(getCurrentUser);
  return { user: data, loading };
}
