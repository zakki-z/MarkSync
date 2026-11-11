import type { Connection } from '../connection';
import type { MessageHandler } from '../message-handler';
import type { ClientMessage } from '../protocol';
import type { RoomManager } from '../room-manager';

type Leave = Extract<ClientMessage, { type: 'leave' }>;

export class LeaveHandler implements MessageHandler<Leave> {
  readonly type = 'leave';

  constructor(private readonly rooms: RoomManager) {}

  handle(connection: Connection, { workspaceId }: Leave) {
    this.rooms.leave(connection, workspaceId);
  }
}
