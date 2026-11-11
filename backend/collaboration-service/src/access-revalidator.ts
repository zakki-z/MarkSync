import type { AccessEnforcer } from './access-enforcer';
import type { ConnectionRegistry } from './connection-registry';
import type { AccessDecision, WorkspaceAccessChecker } from './workspace-access';

/**
 * Re-asks the workspace service whether each connection may still be in each of its rooms, so a
 * member who is removed (or loses access) while connected is evicted within one interval. A sweep
 * asks once per token and workspace however many tabs share them, which is the cache that keeps
 * the load on the workspace service proportional to users rather than connections. An answer other
 * than "granted", including "unavailable", evicts: access is never assumed.
 */
export class AccessRevalidator {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly access: WorkspaceAccessChecker,
    private readonly connections: ConnectionRegistry,
    private readonly enforcer: AccessEnforcer,
    private readonly intervalMs: number,
  ) {}

  async sweep() {
    if (this.running) return;
    this.running = true;
    try {
      const decisions = new Map<string, Promise<AccessDecision>>();
      const decide = (token: string, workspaceId: number) => {
        const key = `${workspaceId}:${token}`;
        const known = decisions.get(key);
        if (known) return known;
        const asked = this.access
          .check(token, workspaceId)
          .catch((): AccessDecision => 'unavailable');
        decisions.set(key, asked);
        return asked;
      };
      await Promise.all(
        this.connections.all().flatMap((connection) =>
          [...connection.rooms].map(async (workspaceId) => {
            const decision = await decide(connection.token, workspaceId);
            // The connection may have gone or left the room while the answer was on its way.
            if (decision !== 'granted' && connection.rooms.has(workspaceId))
              this.enforcer.refuse(connection, workspaceId, decision);
          }),
        ),
      );
    } finally {
      this.running = false;
    }
  }

  start() {
    this.timer ??= setInterval(() => void this.sweep(), this.intervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
