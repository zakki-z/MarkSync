import type { Connection } from '../connection';
import type { DocumentSessionManager } from '../documents/document-session-manager';
import type { MessageHandler } from '../message-handler';
import { ErrorCode, type ClientMessage } from '../protocol';

type Sync = Extract<ClientMessage, { type: 'document-sync' }>;

/** Applies a Yjs sync message to the document the sender has joined. */
export class DocumentSyncHandler implements MessageHandler<Sync> {
  readonly type = 'document-sync';

  constructor(private readonly documents: DocumentSessionManager) {}

  handle(connection: Connection, { documentId, payload }: Sync) {
    const session = this.documents.sessionOf(connection, documentId);
    if (!session) {
      connection.send({
        type: 'error',
        code: ErrorCode.NotJoined,
        message: 'Join the document before syncing it.',
        documentId,
      });
      return;
    }
    try {
      session.receiveSync(connection, payload);
    } catch {
      // The payload is not a valid y-protocols message; nothing was applied.
      connection.send({
        type: 'error',
        code: ErrorCode.InvalidMessage,
        message: 'Invalid sync message.',
        documentId,
      });
    }
  }
}
