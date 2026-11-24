import { QueryClient } from '@tanstack/react-query';

/**
 * Failed requests are not retried: the UI already offers a retry, and a 401 must reach the session
 * handling at once. Refetching on window focus is off so that returning to the tab never replaces
 * what the user is looking at.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}
