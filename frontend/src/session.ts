/** Lightweight tab-scoped session for the Task 1 walking skeleton. */
const SESSION_KEY = 'marksync_access_token';

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(SESSION_KEY);
}

export function saveSessionToken(token: string): void {
  window.sessionStorage.setItem(SESSION_KEY, token);
}

export function clearSessionToken(): void {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(SESSION_KEY);
}
