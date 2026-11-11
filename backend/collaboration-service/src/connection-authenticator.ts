import type { FetchFn } from './http';
import type { PublicUser } from './protocol';

export type AuthResult =
  | { status: 'authenticated'; user: PublicUser }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

/** Verifies the session token presented during the WebSocket handshake. Never rejects. */
export interface ConnectionAuthenticator {
  authenticate(token: string): Promise<AuthResult>;
}

const SESSION_COOKIE = 'marksync_session';

export function sessionToken(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

/** Asks the auth service who the token belongs to. Only the id and username are kept. */
export class AuthServiceAuthenticator implements ConnectionAuthenticator {
  constructor(
    private readonly authUrl: string,
    private readonly timeoutMs = 5000,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const response = await this.fetchFn(`${this.authUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status >= 500) return { status: 'unavailable' };
      if (!response.ok) return { status: 'unauthenticated' };
      const profile = (await response.json()) as { id?: unknown; username?: unknown };
      if (
        typeof profile.id !== 'number' ||
        !Number.isSafeInteger(profile.id) ||
        profile.id <= 0 ||
        typeof profile.username !== 'string' ||
        profile.username === ''
      )
        return { status: 'unauthenticated' };
      return { status: 'authenticated', user: { id: profile.id, displayName: profile.username } };
    } catch {
      return { status: 'unavailable' };
    }
  }
}
