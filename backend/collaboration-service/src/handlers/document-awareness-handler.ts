import type { Connection } from '../connection';
import type { DocumentSessionManager } from '../documents/document-session-manager';
import type { MessageHandler } from '../message-handler';
import { ErrorCode, type ClientMessage } from '../protocol';

type Awareness = Extract<ClientMessage, { type: 'document-awareness' }>;

/** Relays a collaborator's cursor and selection to the others in the document. */
export class DocumentAwarenessHandler implements MessageHandler<Awareness> {
  readonly type = 'document-awareness';

  constructor(private readonly documents: DocumentSessionManager) {}

  handle(connection: Connection, { documentId, payload }: Awareness) {
    const session = this.documents.sessionOf(connection, documentId);
    if (!session) {
      connection.send({
        type: 'error',
        code: ErrorCode.NotJoined,
        message: 'Join the document before sharing your cursor.',
        documentId,
      });
      return;
    }
    try {
      session.receiveAwareness(connection, payload);
    } catch {
      connection.send({
        type: 'error',
        code: ErrorCode.InvalidMessage,
        message: 'Invalid awareness message.',
        documentId,
      });
    }
  }
}
