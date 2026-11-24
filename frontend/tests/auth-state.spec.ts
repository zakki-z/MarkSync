import { expect, test } from '@playwright/test';
import {
  authReducer,
  guardView,
  initialAuthState,
  safeReturnPath,
  signInPath,
  type AuthState,
} from '../src/auth/authState';

const user = { id: 7, email: 'user@sussex.ac.uk', role: 'user' };
const failure = new Error('Auth Service is unavailable.');

test.describe('auth state machine', () => {
  test('starts loading and settles once', () => {
    expect(initialAuthState).toEqual({ status: 'loading' });
    const signedIn = authReducer(initialAuthState, { type: 'resolved', user });
    expect(signedIn).toEqual({ status: 'authenticated', user });
    expect(authReducer(initialAuthState, { type: 'unauthorized' })).toEqual({
      status: 'unauthenticated',
    });
    expect(authReducer(initialAuthState, { type: 'failed', error: failure })).toEqual({
      status: 'error',
      error: failure,
    });
  });

  test('a 401 ends a signed-in session but a late check result does not revive it', () => {
    const signedIn: AuthState = { status: 'authenticated', user };
    const ended = authReducer(signedIn, { type: 'unauthorized' });
    expect(ended).toEqual({ status: 'unauthenticated' });
    expect(authReducer(ended, { type: 'resolved', user })).toBe(ended);
    expect(authReducer(ended, { type: 'unauthorized' })).toBe(ended);
  });

  test('a failed check is not a sign-out and can be retried', () => {
    const failed = authReducer(initialAuthState, { type: 'failed', error: failure });
    expect(guardView(failed, false)).toBe('error');
    expect(authReducer(failed, { type: 'retry' })).toEqual({ status: 'loading' });
    const signedIn: AuthState = { status: 'authenticated', user };
    expect(authReducer(signedIn, { type: 'failed', error: failure })).toBe(signedIn);
    expect(authReducer(signedIn, { type: 'retry' })).toBe(signedIn);
  });
});

test.describe('route guard decision', () => {
  test('never shows an error or redirects while the session is loading', () => {
    expect(guardView({ status: 'loading' }, false)).toBe('pending');
    expect(guardView({ status: 'loading' }, true)).toBe('pending');
  });

  test('redirects only when definitively signed out on a protected route', () => {
    expect(guardView({ status: 'authenticated', user }, false)).toBe('signed-in');
    expect(guardView({ status: 'unauthenticated' }, false)).toBe('redirect');
    expect(guardView({ status: 'unauthenticated' }, true)).toBe('anonymous');
  });
});

test.describe('return path', () => {
  test('keeps same-origin paths and drops anything else', () => {
    expect(safeReturnPath('/w/1/members?tab=x')).toBe('/w/1/members?tab=x');
    for (const unsafe of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', '/auth']) {
      expect(safeReturnPath(unsafe)).toBeUndefined();
    }
  });

  test('builds the sign-in URL', () => {
    expect(signInPath('/w/1/d/2')).toBe('/auth?next=%2Fw%2F1%2Fd%2F2');
    expect(signInPath('//evil.test')).toBe('/auth');
    expect(signInPath()).toBe('/auth');
  });
});
