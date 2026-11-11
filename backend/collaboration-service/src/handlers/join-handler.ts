import type { AccessEnforcer } from '../access-enforcer';
import type { Connection } from '../connection';
import type { MessageHandler } from '../message-handler';
import type { ClientMessage } from '../protocol';
import type { RoomManager } from '../room-manager';
import type { WorkspaceAccessChecker } from '../workspace-access';

type Join = Extract<ClientMessage, { type: 'join' }>;

/** The workspace id in the message is never trusted: every join asks the workspace service. */
export class JoinHandler implements MessageHandler<Join> {
  readonly type = 'join';

  constructor(
    private readonly access: WorkspaceAccessChecker,
    private readonly rooms: RoomManager,
    private readonly enforcer: AccessEnforcer,
  ) {}

  async handle(connection: Connection, { workspaceId }: Join) {
    const decision = await this.access.check(connection.token, workspaceId);
    if (!connection.isOpen) return;
    if (decision === 'granted') this.rooms.join(connection, workspaceId);
    else this.enforcer.refuse(connection, workspaceId, decision);
  }
}
