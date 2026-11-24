import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { logoutUser } from '@/src/authService';

/** Clears the session cookie and returns to the login page. */
export function useEndSession() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      // Nothing cached for this session may be shown to whoever signs in next.
      queryClient.clear();
      router.replace('/auth');
      router.refresh();
    }
  }, [router, queryClient]);
}
