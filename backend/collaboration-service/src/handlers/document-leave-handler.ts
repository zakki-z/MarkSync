import type { Connection } from '../connection';
import type { DocumentSessionManager } from '../documents/document-session-manager';
import type { MessageHandler } from '../message-handler';
import type { ClientMessage } from '../protocol';

type Leave = Extract<ClientMessage, { type: 'document-leave' }>;

export class DocumentLeaveHandler implements MessageHandler<Leave> {
  readonly type = 'document-leave';

  constructor(private readonly documents: DocumentSessionManager) {}

  handle(connection: Connection, { documentId }: Leave) {
    return this.documents.leave(connection, documentId);
  }
}
