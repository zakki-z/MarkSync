import type { Connection } from '../connection';
import type { MessageHandler } from '../message-handler';
import type { ClientMessage } from '../protocol';

type Heartbeat = Extract<ClientMessage, { type: 'heartbeat' }>;

/**
 * Liveness itself is recorded by the dispatcher for every frame; the reply lets the client notice
 * a server that stopped answering.
 */
export class HeartbeatHandler implements MessageHandler<Heartbeat> {
  readonly type = 'heartbeat';

  handle(connection: Connection) {
    connection.send({ type: 'heartbeat' });
  }
}
