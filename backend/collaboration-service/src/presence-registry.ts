import type { PublicUser } from './protocol';

/**
 * Who is online per workspace. Keyed by connection so that a user with several tabs stays online
 * until the last tab leaves. An implementation shared between instances (e.g. Redis) can replace
 * the in-memory one without touching the callers.
 */
export interface PresenceRegistry {
  add(workspaceId: number, connectionId: string, user: PublicUser): void;
  remove(workspaceId: number, connectionId: string): void;
  /** Each online user once, ordered by id. */
  online(workspaceId: number): PublicUser[];
}

export class InMemoryPresenceRegistry implements PresenceRegistry {
  private readonly workspaces = new Map<number, Map<string, PublicUser>>();

  add(workspaceId: number, connectionId: string, user: PublicUser) {
    const connections = this.workspaces.get(workspaceId) ?? new Map<string, PublicUser>();
    connections.set(connectionId, user);
    this.workspaces.set(workspaceId, connections);
  }

  remove(workspaceId: number, connectionId: string) {
    const connections = this.workspaces.get(workspaceId);
    connections?.delete(connectionId);
    if (connections?.size === 0) this.workspaces.delete(workspaceId);
  }

  online(workspaceId: number): PublicUser[] {
    const users = new Map<number, PublicUser>();
    for (const user of this.workspaces.get(workspaceId)?.values() ?? [])
      users.set(user.id, { id: user.id, displayName: user.displayName });
    return [...users.values()].sort((a, b) => a.id - b.id);
  }
}
