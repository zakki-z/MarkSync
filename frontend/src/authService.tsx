export type AuthUser = { id: number; email: string; role: string };

async function authRequest(action: string, credentials?: { email: string; password: string }) {
  const response = await fetch(`/api/auth/${action}`, {
    method: action === 'me' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: credentials ? JSON.stringify(credentials) : undefined,
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(
      typeof data?.detail === 'string' ? data.detail : 'Unable to connect. Please try again.',
    );
  }
  return response.status === 204 ? undefined : response.json();
}

export const loginUser = (email: string, password: string) =>
  authRequest('login', { email, password });
export const signupUser = (email: string, password: string) =>
  authRequest('signup', { email, password });
export const getCurrentUser = (): Promise<AuthUser> => authRequest('me');
export const logoutUser = (): Promise<void> => authRequest('logout');
