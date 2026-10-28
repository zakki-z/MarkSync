export type OnlineUser = { id: number; email: string; sessions: number };
export type PresenceMessage =
  | { type: 'ready' | 'pong' }
  | { type: 'presence'; documentId: number; users: OnlineUser[] }
  | { type: 'error'; code: string };

function isUser(value: unknown): value is OnlineUser {
  if (!value || typeof value !== 'object') return false;
  return (
    'id' in value &&
    Number.isSafeInteger(value.id) &&
    'email' in value &&
    typeof value.email === 'string' &&
    'sessions' in value &&
    typeof value.sessions === 'number' &&
    Number.isSafeInteger(value.sessions) &&
    value.sessions > 0
  );
}

export function parsePresenceMessage(raw: string): PresenceMessage | null {
  try {
    const message: unknown = JSON.parse(raw);
    if (!message || typeof message !== 'object' || !('type' in message)) return null;
    if (message.type === 'ready' || message.type === 'pong') return { type: message.type };
    if (message.type === 'error' && 'code' in message && typeof message.code === 'string') {
      return { type: 'error', code: message.code };
    }
    if (
      message.type === 'presence' &&
      'documentId' in message &&
      typeof message.documentId === 'number' &&
      'users' in message &&
      Array.isArray(message.users) &&
      message.users.every(isUser)
    ) {
      return { type: 'presence', documentId: message.documentId, users: message.users };
    }
    return null;
  } catch {
    return null;
  }
}
