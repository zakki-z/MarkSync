import type { CloseCode, PublicUser, ServerMessage } from './protocol';

/** What a connection needs from the underlying socket; Bun's ServerWebSocket satisfies it. */
export interface Transport {
  send(data: string): unknown;
  close(code: number, reason: string): void;
}

/** One authenticated socket. A user with several tabs has several connections. */
export class Connection {
  /** Workspace ids this connection has joined. Maintained by the RoomManager only. */
  readonly rooms = new Set<number>();
  lastSeen: number;
  /** Tail of the connection's pending requests, so its frames are handled one at a time. */
  queue: Promise<void> = Promise.resolve();
  pending = 0;
  private open = true;

  constructor(
    readonly id: string,
    readonly user: PublicUser,
    readonly token: string,
    private readonly transport: Transport,
    now: number,
  ) {
    this.lastSeen = now;
  }

  get isOpen() {
    return this.open;
  }

  send(message: ServerMessage) {
    if (this.open) this.transport.send(JSON.stringify(message));
  }

  close(code: CloseCode, reason: string) {
    if (!this.open) return;
    this.open = false;
    this.transport.close(code, reason);
  }

  /** The transport is already gone (its close event fired). */
  markClosed() {
    this.open = false;
  }
}
