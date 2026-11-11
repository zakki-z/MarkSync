import type { ConnectionRegistry } from './connection-registry';
import type { Connection } from './connection';
import { CloseCode, ErrorCode } from './protocol';
import type { DocumentSessionManager } from './documents/document-session-manager';
import type { RoomManager } from './room-manager';
import type { AccessDecision } from './workspace-access';

type Refusal = Exclude<AccessDecision, 'granted'>;

const REFUSALS = {
  denied: {
    error: ErrorCode.Forbidden,
    message: 'You do not have access to this workspace.',
    documentMessage: 'You do not have access to this document.',
    close: CloseCode.Forbidden,
  },
  unauthenticated: {
    error: ErrorCode.Unauthenticated,
    message: 'Please sign in again.',
    documentMessage: 'Please sign in again.',
    close: CloseCode.Unauthenticated,
  },
  unavailable: {
    error: ErrorCode.Unavailable,
    message: 'Workspace access could not be verified. Try again later.',
    documentMessage: 'Document access could not be verified. Try again later.',
    close: CloseCode.TryAgainLater,
  },
} satisfies Record<
  Refusal,
  { error: ErrorCode; message: string; documentMessage: string; close: CloseCode }
>;

/**
 * Applies a refused access decision, for a join and for revalidation alike: take the connection
 * out of the workspace room or document, tell it why, and close it when nothing is left for it to
 * do. A bad token ends the whole connection; a refusal for one room only ends it if it was the last.
 */
export class AccessEnforcer {
  constructor(
    private readonly rooms: RoomManager,
    private readonly connections: ConnectionRegistry,
    private readonly documents: DocumentSessionManager,
  ) {}

  refuse(connection: Connection, workspaceId: number, decision: Refusal) {
    this.rooms.leave(connection, workspaceId);
    this.deliver(connection, decision, REFUSALS[decision].message, { workspaceId });
  }

  refuseDocument(connection: Connection, documentId: number, decision: Refusal) {
    void this.documents.leave(connection, documentId);
    this.deliver(connection, decision, REFUSALS[decision].documentMessage, { documentId });
  }

  private deliver(
    connection: Connection,
    decision: Refusal,
    message: string,
    target: { workspaceId: number } | { documentId: number },
  ) {
    const refusal = REFUSALS[decision];
    connection.send({ type: 'error', code: refusal.error, message, ...target });
    const nothingLeft = connection.rooms.size === 0 && connection.documents.size === 0;
    if (decision === 'unauthenticated' || nothingLeft)
      this.connections.close(connection, refusal.close, message);
  }
}
