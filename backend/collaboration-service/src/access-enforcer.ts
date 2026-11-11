import type { ConnectionRegistry } from './connection-registry';
import type { Connection } from './connection';
import { CloseCode, ErrorCode } from './protocol';
import type { RoomManager } from './room-manager';
import type { AccessDecision } from './workspace-access';

type Refusal = Exclude<AccessDecision, 'granted'>;

const REFUSALS = {
  denied: {
    error: ErrorCode.Forbidden,
    message: 'You do not have access to this workspace.',
    close: CloseCode.Forbidden,
  },
  unauthenticated: {
    error: ErrorCode.Unauthenticated,
    message: 'Please sign in again.',
    close: CloseCode.Unauthenticated,
  },
  unavailable: {
    error: ErrorCode.Unavailable,
    message: 'Workspace access could not be verified. Try again later.',
    close: CloseCode.TryAgainLater,
  },
} satisfies Record<Refusal, { error: ErrorCode; message: string; close: CloseCode }>;

/**
 * Applies a refused access decision, for a join and for revalidation alike: take the connection
 * out of the workspace room, tell it why, and close it when nothing is left for it to do. A bad
 * token ends the whole connection; a refusal for one workspace only ends it if it was the last.
 */
export class AccessEnforcer {
  constructor(
    private readonly rooms: RoomManager,
    private readonly connections: ConnectionRegistry,
  ) {}

  refuse(connection: Connection, workspaceId: number, decision: Refusal) {
    const refusal = REFUSALS[decision];
    this.rooms.leave(connection, workspaceId);
    connection.send({
      type: 'error',
      code: refusal.error,
      message: refusal.message,
      workspaceId,
    });
    if (decision === 'unauthenticated' || connection.rooms.size === 0)
      this.connections.close(connection, refusal.close, refusal.message);
  }
}
