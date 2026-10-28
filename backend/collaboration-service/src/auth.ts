export type User = { id: number; email: string };
export type Access = {
  authenticate(token: string): Promise<User | null>;
  canAccess(token: string, documentId: number): Promise<boolean>;
};

export function cookieToken(request: Request): string | undefined {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('marksync_session='))
    ?.slice('marksync_session='.length);
}

export function upstreamAccess(authUrl: string, documentUrl: string): Access {
  async function request(url: string, token: string) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 500) throw new Error('Upstream unavailable');
    return response;
  }
  return {
    async authenticate(token) {
      const response = await request(`${authUrl}/auth/me`, token);
      if (!response.ok) return null;
      const user = (await response.json()) as User;
      return Number.isSafeInteger(user.id) && user.id > 0 && typeof user.email === 'string'
        ? user
        : null;
    },
    async canAccess(token, documentId) {
      return (await request(`${documentUrl}/api/documents/${documentId}`, token)).ok;
    },
  };
}
