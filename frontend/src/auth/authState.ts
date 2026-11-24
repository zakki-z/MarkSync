import type { AuthUser } from '@/src/authService';

/**
 * The session as the client knows it. `loading` lasts until the first identity check settles;
 * nothing that depends on the user renders an error before then. `error` means the check itself
 * could not run (network or server failure), which is not the same as being signed out.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' }
  | { status: 'error'; error: Error };

export type AuthEvent =
  | { type: 'resolved'; user: AuthUser }
  | { type: 'unauthorized' }
  | { type: 'failed'; error: Error }
  | { type: 'retry' };

export const initialAuthState: AuthState = { status: 'loading' };

export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'resolved':
      return state.status === 'loading' ? { status: 'authenticated', user: event.user } : state;
    case 'unauthorized':
      // A 401 from any request ends the session, whatever state the check was in.
      return state.status === 'unauthenticated' ? state : { status: 'unauthenticated' };
    case 'failed':
      return state.status === 'loading' ? { status: 'error', error: event.error } : state;
    case 'retry':
      return state.status === 'error' ? initialAuthState : state;
  }
}

/** What a signed-in area renders for a given auth state. */
export type GuardView = 'pending' | 'signed-in' | 'anonymous' | 'redirect' | 'error';

export function guardView(state: AuthState, allowAnonymous: boolean): GuardView {
  switch (state.status) {
    case 'loading':
      return 'pending';
    case 'authenticated':
      return 'signed-in';
    case 'error':
      return 'error';
    case 'unauthenticated':
      return allowAnonymous ? 'anonymous' : 'redirect';
  }
}

/**
 * Accepts only same-origin paths, so `?next=` cannot send someone to another site after login.
 */
export function safeReturnPath(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return undefined;
  }
  if (value === '/auth' || value.startsWith('/auth?') || value.startsWith('/auth/')) {
    return undefined;
  }
  return value;
}

export function signInPath(returnTo?: string): string {
  const next = safeReturnPath(returnTo);
  return next ? `/auth?next=${encodeURIComponent(next)}` : '/auth';
}
