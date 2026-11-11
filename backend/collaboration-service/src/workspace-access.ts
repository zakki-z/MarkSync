import type { FetchFn } from './http';
export type AccessDecision = 'granted' | 'denied' | 'unauthenticated' | 'unavailable';

/**
 * Asks whether the token's user may be in a workspace's room. The collaboration service owns no
 * workspace data, so the answer always comes from the workspace service. Never rejects: anything
 * that is not a clear "granted" is a refusal (fail closed).
 */
export interface WorkspaceAccessChecker {
  check(token: string, workspaceId: number): Promise<AccessDecision>;
}

/** Any role (owner, editor, viewer) may join; non-members get 404 from the membership endpoint. */
export class HttpWorkspaceAccessChecker implements WorkspaceAccessChecker {
  constructor(
    private readonly workspaceUrl: string,
    private readonly timeoutMs = 5000,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async check(token: string, workspaceId: number): Promise<AccessDecision> {
    try {
      const response = await this.fetchFn(
        `${this.workspaceUrl}/api/workspaces/${workspaceId}/membership`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (response.ok) return 'granted';
      if (response.status === 401) return 'unauthenticated';
      if (response.status === 403 || response.status === 404) return 'denied';
      return 'unavailable';
    } catch {
      return 'unavailable';
    }
  }
}
