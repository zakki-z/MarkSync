'use client';

import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import { ApiError, setUnauthorizedHandler } from '@/src/apiClient';
import { getCurrentUser } from '@/src/authService';
import { authReducer, initialAuthState, type AuthState } from './authState';

type AuthContextValue = {
  state: AuthState;
  /** Marks the session as ended, for example when the presence socket reports it expired. */
  expire: () => void;
  /** Runs the identity check again after it failed for a reason other than being signed out. */
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Resolves the session once, then keeps it in sync with 401s from any API request. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        dispatch({ type: 'unauthorized' });
        return false;
      }),
    [],
  );

  const checking = state.status === 'loading';
  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    getCurrentUser().then(
      (user) => !cancelled && dispatch({ type: 'resolved', user }),
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) dispatch({ type: 'unauthorized' });
        else
          dispatch({
            type: 'failed',
            error: error instanceof Error ? error : new Error('Unable to check your session.'),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [checking]);

  return (
    <AuthContext.Provider
      value={{
        state,
        expire: () => dispatch({ type: 'unauthorized' }),
        retry: () => dispatch({ type: 'retry' }),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
