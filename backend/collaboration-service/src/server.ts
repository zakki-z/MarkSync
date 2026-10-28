import type { ServerWebSocket } from 'bun';
import { cookieToken, type Access, type User } from './auth';
import { Presence } from './presence';
import { parseMessage, type ServerMessage } from './protocol';

type Connection = {
  user: User;
  token: string;
  room: number | null;
  revision: number;
  lastSeen: number;
  checking: boolean;
  joining: boolean;
  closed: boolean;
};
type Socket = ServerWebSocket<Connection>;
type Options = {
  port: number;
  origins: string[];
  access: Access;
  sweepMs?: number;
  idleMs?: number;
};

export function startServer({ port, origins, access, sweepMs = 15_000, idleMs = 45_000 }: Options) {
  const presence = new Presence();
  const connections = new Set<Socket>();
  const send = (ws: Socket, message: ServerMessage) => ws.send(JSON.stringify(message));
  function reject(
    ws: Socket,
    code: Extract<ServerMessage, { type: 'error' }>['code'],
    message: string,
  ) {
    if (ws.data.closed) return;
    ws.data.closed = true;
    ws.data.revision++;
    presence.leave(ws);
    send(ws, { type: 'error', code, message });
    ws.close(code === 'UNAUTHORIZED' ? 4401 : 1008, message);
  }

  const server = Bun.serve<Connection>({
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === '/health') return Response.json({ status: 'ok' });
      if (url.pathname !== '/ws' || url.search) return new Response(null, { status: 404 });
      if (!origins.includes(request.headers.get('origin') ?? ''))
        return new Response(null, { status: 403 });
      const token = cookieToken(request);
      if (!token) return new Response(null, { status: 401 });
      try {
        const user = await access.authenticate(token);
        if (!user) return new Response(null, { status: 401 });
        if (
          server.upgrade(request, {
            data: {
              user,
              token,
              room: null,
              revision: 0,
              lastSeen: Date.now(),
              checking: false,
              joining: false,
              closed: false,
            },
          })
        )
          return;
        return new Response(null, { status: 400 });
      } catch {
        return new Response(null, { status: 503 });
      }
    },
    websocket: {
      maxPayloadLength: 1024,
      idleTimeout: 60,
      backpressureLimit: 64 * 1024,
      closeOnBackpressureLimit: true,
      open(ws) {
        connections.add(ws);
        send(ws, { type: 'ready' });
      },
      async message(ws, raw) {
        if (ws.data.closed) return;
        const message = typeof raw === 'string' ? parseMessage(raw) : null;
        if (!message) return reject(ws, 'INVALID_MESSAGE', 'Invalid message.');
        ws.data.lastSeen = Date.now();
        if (message.type === 'ping') {
          send(ws, { type: 'pong' });
          return;
        }
        const revision = ++ws.data.revision;
        if (message.type === 'leave') {
          presence.leave(ws);
          return;
        }
        if (ws.data.room !== message.documentId) presence.leave(ws);
        // Bound concurrent authorization work and invalidate in-flight joins on leave/close.
        if (ws.data.joining) return reject(ws, 'INVALID_MESSAGE', 'Wait for the previous request.');
        ws.data.joining = true;
        try {
          const user = await access.authenticate(ws.data.token);
          if (ws.data.closed || revision !== ws.data.revision) return;
          if (!user) return reject(ws, 'UNAUTHORIZED', 'Please sign in again.');
          const allowed = await access.canAccess(ws.data.token, message.documentId);
          if (ws.data.closed || revision !== ws.data.revision) return;
          if (!allowed) return reject(ws, 'DOCUMENT_UNAVAILABLE', 'Document unavailable.');
          presence.join(ws, message.documentId);
        } catch {
          reject(ws, 'SERVICE_UNAVAILABLE', 'Presence is temporarily unavailable.');
        } finally {
          ws.data.joining = false;
        }
      },
      close(ws) {
        ws.data.closed = true;
        ws.data.revision++;
        presence.leave(ws);
        connections.delete(ws);
      },
    },
  });
  const timer = setInterval(() => {
    for (const ws of connections) {
      if (ws.data.closed) continue;
      if (Date.now() - ws.data.lastSeen > idleMs) {
        reject(ws, 'UNAUTHORIZED', 'Connection timed out.');
        continue;
      }
      if (ws.data.checking || ws.data.joining) continue;
      ws.data.checking = true;
      const revision = ws.data.revision;
      void (async () => {
        try {
          if (!(await access.authenticate(ws.data.token)))
            return reject(ws, 'UNAUTHORIZED', 'Please sign in again.');
          const room = ws.data.room;
          if (
            room !== null &&
            !(await access.canAccess(ws.data.token, room)) &&
            revision === ws.data.revision
          ) {
            reject(ws, 'DOCUMENT_UNAVAILABLE', 'Document unavailable.');
          }
        } catch {
          reject(ws, 'SERVICE_UNAVAILABLE', 'Presence is temporarily unavailable.');
        } finally {
          ws.data.checking = false;
        }
      })();
    }
  }, sweepMs);
  return {
    server,
    stop() {
      clearInterval(timer);
      // Bun 1.3.14 may leave stop's promise pending after a server-initiated WS close.
      // stop(true) still closes the listener and sockets synchronously.
      void server.stop(true);
    },
  };
}
