import type { Connection } from './connection';
import type { PresenceRegistry } from './presence-registry';
import type { ServerMessage } from './protocol';

/** Which connections are in which workspace room, and delivery to a room's members. */
export class RoomManager {
  private readonly rooms = new Map<number, Set<Connection>>();

  constructor(private readonly presence: PresenceRegistry) {}

  /** Callers must have verified access. Joining again just refreshes everyone's presence list. */
  join(connection: Connection, workspaceId: number) {
    const room = this.rooms.get(workspaceId) ?? new Set<Connection>();
    room.add(connection);
    this.rooms.set(workspaceId, room);
    connection.rooms.add(workspaceId);
    this.presence.add(workspaceId, connection.id, connection.user);
    this.broadcastPresence(workspaceId);
  }

  leave(connection: Connection, workspaceId: number) {
    if (!connection.rooms.delete(workspaceId)) return;
    const room = this.rooms.get(workspaceId);
    room?.delete(connection);
    if (room?.size === 0) this.rooms.delete(workspaceId);
    this.presence.remove(workspaceId, connection.id);
    this.broadcastPresence(workspaceId);
  }

  leaveAll(connection: Connection) {
    for (const workspaceId of [...connection.rooms]) this.leave(connection, workspaceId);
  }

  isMember(connection: Connection, workspaceId: number) {
    return connection.rooms.has(workspaceId);
  }

  broadcast(workspaceId: number, message: ServerMessage) {
    for (const member of this.rooms.get(workspaceId) ?? []) member.send(message);
  }

  private broadcastPresence(workspaceId: number) {
    this.broadcast(workspaceId, {
      type: 'presence',
      workspaceId,
      users: this.presence.online(workspaceId),
    });
  }
}
