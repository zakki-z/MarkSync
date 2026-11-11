import { createApp } from '../src/app';
import { Connection, type Transport } from '../src/connection';
import type { ServerMessage } from '../src/protocol';
import type { AccessDecision, WorkspaceAccessChecker } from '../src/workspace-access';

export class FakeTransport implements Transport {
  readonly frames: ServerMessage[] = [];
  closed?: { code: number; reason: string };

  send(data: string) {
    this.frames.push(JSON.parse(data));
  }

  close(code: number, reason: string) {
    this.closed = { code, reason };
  }

  /** Frames of one type, e.g. `transport.of('presence')`. */
  of<T extends ServerMessage['type']>(type: T) {
    return this.frames.filter(
      (frame): frame is Extract<ServerMessage, { type: T }> => frame.type === type,
    );
  }

  get lastPresence() {
    return this.of('presence').at(-1);
  }
}

/** Decisions per `${token}:${workspaceId}`, defaulting to the `fallback`. Calls are recorded. */
export class FakeAccess implements WorkspaceAccessChecker {
  readonly calls: string[] = [];
  private readonly decisions = new Map<string, AccessDecision>();
  gate?: Promise<void>;

  constructor(private readonly fallback: AccessDecision = 'granted') {}

  set(token: string, workspaceId: number, decision: AccessDecision) {
    this.decisions.set(`${token}:${workspaceId}`, decision);
  }

  async check(token: string, workspaceId: number) {
    this.calls.push(`${token}:${workspaceId}`);
    await this.gate;
    return this.decisions.get(`${token}:${workspaceId}`) ?? this.fallback;
  }
}

let counter = 0;
/** Registers a fake connection for a user; the token doubles as the user's name. */
export function connect(app: ReturnType<typeof createApp>, userId: number, now = 0) {
  const transport = new FakeTransport();
  const connection = new Connection(
    `c${++counter}`,
    { id: userId, displayName: `user${userId}` },
    `token${userId}`,
    transport,
    now,
  );
  app.connections.add(connection);
  return { connection, transport };
}

export const join = (workspaceId: number) => JSON.stringify({ type: 'join', workspaceId });
export const leave = (workspaceId: number) => JSON.stringify({ type: 'leave', workspaceId });
