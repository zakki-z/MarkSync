import type { Connection } from './connection';
import { ErrorCode, parseClientMessage, type ClientMessage, type MessageType } from './protocol';

/** Handles one message type. Adding a type means adding a handler, never editing the dispatcher. */
export interface MessageHandler<M extends ClientMessage = ClientMessage> {
  readonly type: M['type'];
  handle(connection: Connection, message: M): Promise<void> | void;
}

type HandlerFor<T extends MessageType> = MessageHandler<Extract<ClientMessage, { type: T }>>;
export type AnyMessageHandler = { [T in MessageType]: HandlerFor<T> }[MessageType];

/** Requests a connection may have queued behind a slow one before further ones are dropped. */
const MAX_PENDING = 32;

export class MessageDispatcher {
  private readonly handlers = new Map<MessageType, MessageHandler>();

  constructor(handlers: AnyMessageHandler[]) {
    for (const handler of handlers) this.handlers.set(handler.type, handler as MessageHandler);
  }

  /**
   * Validates a raw frame and runs its handler. Frames of one connection run one after another, so
   * a leave can never overtake the join it follows. Never rejects: a bad frame or a failing handler
   * is answered with an error and the connection stays open.
   */
  dispatch(connection: Connection, raw: unknown): Promise<void> {
    const message = parseClientMessage(raw);
    const handler = message && this.handlers.get(message.type);
    if (!message || !handler) {
      connection.send({
        type: 'error',
        code: ErrorCode.InvalidMessage,
        message: 'Invalid message.',
      });
      return Promise.resolve();
    }
    if (connection.pending >= MAX_PENDING) {
      connection.send({
        type: 'error',
        code: ErrorCode.InvalidMessage,
        message: 'Too many pending requests.',
      });
      return Promise.resolve();
    }
    connection.pending++;
    connection.queue = connection.queue
      .then(() => handler.handle(connection, message))
      .catch(() =>
        connection.send({
          type: 'error',
          code: ErrorCode.Unavailable,
          message: 'The request failed.',
        }),
      )
      .finally(() => {
        connection.pending--;
      });
    return connection.queue;
  }
}
