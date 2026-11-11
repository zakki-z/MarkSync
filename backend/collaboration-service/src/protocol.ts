/**
 * The workspace presence protocol: JSON text frames, one message per frame. The frontend keeps a
 * mirror of this file in `frontend/src/presence/protocol.ts`; a test fails if the two drift apart.
 */

/** Close codes. 4xxx codes are application codes; the client must not reconnect after 4401/4403. */
export const CloseCode = {
  GoingAway: 1001,
  TryAgainLater: 1013,
  Unauthenticated: 4401,
  Forbidden: 4403,
  HeartbeatTimeout: 4408,
} as const;
export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];

export const ErrorCode = {
  InvalidMessage: 'INVALID_MESSAGE',
  NotJoined: 'NOT_JOINED',
  Forbidden: 'FORBIDDEN',
  Unauthenticated: 'UNAUTHENTICATED',
  Unavailable: 'UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const HEARTBEAT_INTERVAL_MS = 15_000;
export const MAX_TEXT_LENGTH = 2000;
/** Generous upper bound for one frame: a maximal text of 4-byte characters plus the envelope. */
export const MAX_FRAME_BYTES = 16 * 1024;

/** The only user data other members ever see: no email, no token. */
export type PublicUser = { id: number; displayName: string };

export type ClientMessage =
  | { type: 'join'; workspaceId: number }
  | { type: 'leave'; workspaceId: number }
  | { type: 'heartbeat' }
  | { type: 'message'; workspaceId: number; text: string };

export type ServerMessage =
  | { type: 'presence'; workspaceId: number; users: PublicUser[] }
  | { type: 'message'; workspaceId: number; sender: PublicUser; text: string; sentAt: string }
  | { type: 'heartbeat' }
  | { type: 'error'; code: ErrorCode; message: string; workspaceId?: number };

export type MessageType = ClientMessage['type'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Unknown keys are rejected so a frame never carries more than the protocol defines. */
function hasKeys(record: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(record);
  return actual.length === keys.length && keys.every((key) => key in record);
}

function isWorkspaceId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Returns the message, or null for anything that is not exactly a valid client message. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_FRAME_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  switch (data.type) {
    case 'heartbeat':
      return hasKeys(data, ['type']) ? { type: 'heartbeat' } : null;
    case 'join':
    case 'leave':
      return hasKeys(data, ['type', 'workspaceId']) && isWorkspaceId(data.workspaceId)
        ? { type: data.type, workspaceId: data.workspaceId }
        : null;
    case 'message':
      return hasKeys(data, ['type', 'workspaceId', 'text']) &&
        isWorkspaceId(data.workspaceId) &&
        typeof data.text === 'string' &&
        data.text.trim().length > 0 &&
        data.text.length <= MAX_TEXT_LENGTH
        ? { type: 'message', workspaceId: data.workspaceId, text: data.text }
        : null;
    default:
      return null;
  }
}
