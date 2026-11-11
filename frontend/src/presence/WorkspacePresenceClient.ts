import {
  CloseCode,
  ErrorCode,
  HEARTBEAT_INTERVAL_MS,
  parseServerMessage,
  type ClientMessage,
  type PublicUser,
} from './protocol';

export type ConnectionStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'revoked';

export type ChatMessage = { id: number; sender: PublicUser; text: string; sentAt: string };

/** Everything the UI shows. A new object on every change, so it can back a React store. */
export type PresenceSnapshot = {
  status: ConnectionStatus;
  users: PublicUser[];
  messages: ChatMessage[];
};

/** The part of the browser's WebSocket the client uses, so tests can substitute a fake. */
export interface PresenceSocket {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number): void;
}

/** Timers behind an interface so reconnect behaviour is testable without real time. */
export interface Scheduler {
  after(ms: number, run: () => void): () => void;
  every(ms: number, run: () => void): () => void;
}

export const browserScheduler: Scheduler = {
  after(ms, run) {
    const id = setTimeout(run, ms);
    return () => clearTimeout(id);
  },
  every(ms, run) {
    const id = setInterval(run, ms);
    return () => clearInterval(id);
  },
};

export const INITIAL_SNAPSHOT: PresenceSnapshot = { status: 'connecting', users: [], messages: [] };

const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
/** Heartbeats the server may leave unanswered before the connection is presumed dead. */
const MAX_UNANSWERED = 3;
const MAX_MESSAGES = 100;
const SOCKET_OPEN = 1;

type Options = {
  workspaceId: number;
  createSocket: () => PresenceSocket;
  scheduler?: Scheduler;
  random?: () => number;
  /** Called when the server says the session is no longer valid. */
  onSessionExpired?: () => void;
};

/**
 * One workspace's presence connection: connect, join, heartbeat, and after any loss reconnect with
 * exponential backoff and jitter and join again. It never reconnects when the server says the
 * session expired (4401) or access was revoked (4403). All state shown comes from the server.
 */
export class WorkspacePresenceClient {
  private snapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private readonly workspaceId: number;
  private readonly createSocket: () => PresenceSocket;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;
  private readonly onSessionExpired?: () => void;
  private socket?: PresenceSocket;
  private stopHeartbeat?: () => void;
  private cancelReconnect?: () => void;
  private attempts = 0;
  private unanswered = 0;
  private nextMessageId = 1;
  private finished = false;

  constructor(options: Options) {
    this.workspaceId = options.workspaceId;
    this.createSocket = options.createSocket;
    this.scheduler = options.scheduler ?? browserScheduler;
    this.random = options.random ?? Math.random;
    this.onSessionExpired = options.onSessionExpired;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start() {
    this.connect();
  }

  /** Returns false (and sends nothing) unless the server has confirmed the join. */
  send(text: string) {
    if (this.snapshot.status !== 'connected' || this.socket?.readyState !== SOCKET_OPEN)
      return false;
    this.transmit({ type: 'message', workspaceId: this.workspaceId, text });
    return true;
  }

  /** Leaves the room, closes the socket and stops all timers. The client cannot be restarted. */
  dispose() {
    if (this.finished) return;
    const socket = this.socket;
    if (socket?.readyState === SOCKET_OPEN)
      this.transmit({ type: 'leave', workspaceId: this.workspaceId });
    this.finish();
  }

  private connect() {
    const socket = this.createSocket();
    this.socket = socket;
    this.unanswered = 0;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.transmit({ type: 'join', workspaceId: this.workspaceId });
      this.stopHeartbeat = this.scheduler.every(HEARTBEAT_INTERVAL_MS, () => this.beat(socket));
    };
    socket.onmessage = (event) => {
      if (this.socket === socket) this.receive(event.data);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.closed(event.code);
    };
  }

  private beat(socket: PresenceSocket) {
    if (this.socket !== socket) return;
    if (this.unanswered >= MAX_UNANSWERED) {
      // A dead network may never deliver a close event, so do not wait for one.
      this.abandon();
      return;
    }
    this.unanswered++;
    this.transmit({ type: 'heartbeat' });
  }

  private receive(data: unknown) {
    const message = parseServerMessage(data);
    if (!message) return;
    this.unanswered = 0;
    switch (message.type) {
      case 'presence':
        if (message.workspaceId !== this.workspaceId) return;
        this.attempts = 0;
        this.update({ status: 'connected', users: message.users });
        return;
      case 'message':
        if (message.workspaceId !== this.workspaceId) return;
        this.update({
          messages: [
            ...this.snapshot.messages,
            {
              id: this.nextMessageId++,
              sender: message.sender,
              text: message.text,
              sentAt: message.sentAt,
            },
          ].slice(-MAX_MESSAGES),
        });
        return;
      case 'error':
        this.failed(message.code, message.workspaceId);
        return;
      case 'heartbeat':
        return;
    }
  }

  private failed(code: ErrorCode, workspaceId?: number) {
    if (code === ErrorCode.Forbidden && workspaceId === this.workspaceId) {
      this.end('revoked');
    } else if (code === ErrorCode.Unauthenticated) {
      this.end('disconnected');
      this.onSessionExpired?.();
    } else if (code === ErrorCode.Unavailable) {
      this.abandon();
    }
  }

  private closed(code: number) {
    if (code === CloseCode.Unauthenticated) {
      this.end('disconnected');
      this.onSessionExpired?.();
    } else if (code === CloseCode.Forbidden) {
      this.end('revoked');
    } else {
      this.abandon();
    }
  }

  /** Gives up on the current socket and schedules a new one. */
  private abandon() {
    this.detach();
    this.update({ status: 'reconnecting', users: [] });
    const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** this.attempts++);
    const delay = ceiling / 2 + (this.random() * ceiling) / 2;
    this.cancelReconnect = this.scheduler.after(delay, () => this.connect());
  }

  /** The server decided: no further attempts. */
  private end(status: 'disconnected' | 'revoked') {
    this.finish();
    this.update({ status, users: [] });
  }

  private finish() {
    this.finished = true;
    this.detach();
  }

  private detach() {
    this.stopHeartbeat?.();
    this.stopHeartbeat = undefined;
    this.cancelReconnect?.();
    this.cancelReconnect = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onclose = null;
      socket.close(1000);
    }
  }

  private transmit(message: ClientMessage) {
    this.socket?.send(JSON.stringify(message));
  }

  private update(change: Partial<PresenceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }
}
