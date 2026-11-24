import { getCurrentUser } from '@/src/authService';
import { queryKeys, staleTime } from '@/src/queries/keys';
import { useServerQuery } from './useServerQuery';

/** `user` is undefined for anonymous visitors, which is valid on public documents. */
export function useCurrentUser() {
  const { data, loading } = useServerQuery(queryKeys.me, getCurrentUser, staleTime.session);
  return { user: data, loading };
}
