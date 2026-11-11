/**
 * Mirror of backend/collaboration-service/src/protocol.ts. The frontend and the service are built
 * separately, so the file is copied; a collaboration-service test fails if the two drift apart.
 */

export const CloseCode = {
  ServiceRestart: 1012,
  TryAgainLater: 1013,
  Unauthenticated: 4401,
  Forbidden: 4403,
  HeartbeatTimeout: 4408,
} as const;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPublicUser(value: unknown): value is PublicUser {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    Number.isSafeInteger(value.id) &&
    typeof value.displayName === 'string'
  );
}

const ERROR_CODES: readonly unknown[] = Object.values(ErrorCode);

/** Returns the message, or null for anything that is not a well-formed server message. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const workspaceId = data.workspaceId;
  switch (data.type) {
    case 'heartbeat':
      return { type: 'heartbeat' };
    case 'presence':
      return typeof workspaceId === 'number' &&
        Array.isArray(data.users) &&
        data.users.every(isPublicUser)
        ? {
            type: 'presence',
            workspaceId,
            users: data.users.map(({ id, displayName }) => ({ id, displayName })),
          }
        : null;
    case 'message':
      return typeof workspaceId === 'number' &&
        isPublicUser(data.sender) &&
        typeof data.text === 'string' &&
        typeof data.sentAt === 'string'
        ? {
            type: 'message',
            workspaceId,
            sender: { id: data.sender.id, displayName: data.sender.displayName },
            text: data.text,
            sentAt: data.sentAt,
          }
        : null;
    case 'error':
      return ERROR_CODES.includes(data.code) && typeof data.message === 'string'
        ? {
            type: 'error',
            code: data.code as ErrorCode,
            message: data.message,
            ...(typeof workspaceId === 'number' && { workspaceId }),
          }
        : null;
    default:
      return null;
  }
}
