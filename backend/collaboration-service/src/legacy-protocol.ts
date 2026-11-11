export type ClientMessage =
  { type: 'join'; documentId: number } | { type: 'leave' } | { type: 'ping' };
export type OnlineUser = { id: number; email: string; sessions: number };
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'presence'; documentId: number; users: OnlineUser[] }
  | {
      type: 'error';
      code: 'INVALID_MESSAGE' | 'UNAUTHORIZED' | 'DOCUMENT_UNAVAILABLE' | 'SERVICE_UNAVAILABLE';
      message: string;
    };

export function parseMessage(raw: string): ClientMessage | null {
  if (raw.length > 1024) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data) || !('type' in data)) return null;
    const keys = Object.keys(data);
    if ((data.type === 'leave' || data.type === 'ping') && keys.length === 1)
      return { type: data.type };
    if (
      data.type === 'join' &&
      keys.length === 2 &&
      'documentId' in data &&
      typeof data.documentId === 'number' &&
      Number.isSafeInteger(data.documentId) &&
      data.documentId > 0
    ) {
      return { type: 'join', documentId: data.documentId };
    }
    return null;
  } catch {
    return null;
  }
}
