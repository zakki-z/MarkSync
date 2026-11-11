import type { Connection } from './connection';
import type { RoomManager } from './room-manager';
import type { CloseCode } from './protocol';

/** Every live connection, including those that have joined no room yet. */
export class ConnectionRegistry {
  private readonly connections = new Set<Connection>();

  constructor(private readonly rooms: RoomManager) {}

  add(connection: Connection) {
    this.connections.add(connection);
  }

  all(): Connection[] {
    return [...this.connections];
  }

  /** The socket is gone (or about to be): forget it and update everyone's presence. Idempotent. */
  remove(connection: Connection) {
    this.connections.delete(connection);
    this.rooms.leaveAll(connection);
  }

  /** Server-initiated close. Cleans up at once instead of waiting for the close event. */
  close(connection: Connection, code: CloseCode, reason: string) {
    connection.close(code, reason);
    this.remove(connection);
  }

  closeAll(code: CloseCode, reason: string) {
    for (const connection of this.all()) this.close(connection, code, reason);
  }
}
