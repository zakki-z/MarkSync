import type { Connection } from '../connection';
import type { MessageHandler } from '../message-handler';
import { ErrorCode, type ClientMessage } from '../protocol';
import type { RoomManager } from '../room-manager';

type Chat = Extract<ClientMessage, { type: 'message' }>;

/** Relays a message to everyone in the room, the sender included, so all see the server's order. */
export class ChatHandler implements MessageHandler<Chat> {
  readonly type = 'message';

  constructor(
    private readonly rooms: RoomManager,
    private readonly clock: () => number,
  ) {}

  handle(connection: Connection, { workspaceId, text }: Chat) {
    if (!this.rooms.isMember(connection, workspaceId)) {
      connection.send({
        type: 'error',
        code: ErrorCode.NotJoined,
        message: 'Join the workspace before sending to it.',
        workspaceId,
      });
      return;
    }
    this.rooms.broadcast(workspaceId, {
      type: 'message',
      workspaceId,
      sender: connection.user,
      text,
      sentAt: new Date(this.clock()).toISOString(),
    });
  }
}
