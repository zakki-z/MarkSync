import type { AccessEnforcer } from '../access-enforcer';
import type { Connection } from '../connection';
import type { DocumentAccessChecker } from '../document-access';
import type { DocumentSessionManager } from '../documents/document-session-manager';
import type { MessageHandler } from '../message-handler';
import type { ClientMessage } from '../protocol';

type Join = Extract<ClientMessage, { type: 'document-join' }>;

/**
 * The document id in the message is never trusted: every join asks the Document service, which
 * applies the document access policy. Read access is enough to join; `canEdit` decides whether the
 * connection's updates will be accepted.
 */
export class DocumentJoinHandler implements MessageHandler<Join> {
  readonly type = 'document-join';

  constructor(
    private readonly access: DocumentAccessChecker,
    private readonly documents: DocumentSessionManager,
    private readonly enforcer: AccessEnforcer,
  ) {}

  async handle(connection: Connection, { documentId }: Join) {
    const access = await this.access.check(connection.token, documentId);
    if (!connection.isOpen) return;
    if (access.status !== 'granted') {
      this.enforcer.refuseDocument(connection, documentId, access.status);
      return;
    }
    const session = await this.documents.join(connection, documentId, access);
    if (!session) return;
    connection.send({ type: 'document-access', documentId, canEdit: access.canEdit });
    session.greet(connection);
  }
}
