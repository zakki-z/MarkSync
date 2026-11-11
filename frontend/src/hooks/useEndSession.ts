import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { logoutUser } from '@/src/authService';

/** Clears the session cookie and returns to the login page. */
export function useEndSession() {
  const router = useRouter();
  return useCallback(async () => {
    try {
      await logoutUser();
    } finally {
      router.replace('/auth');
      router.refresh();
    }
  }, [router]);
}
