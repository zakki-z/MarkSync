import type { App } from './app';
import { Connection } from './connection';
import { sessionToken, type ConnectionAuthenticator } from './connection-authenticator';
import { MAX_FRAME_BYTES, type PublicUser } from './protocol';

type Options = {
  port: number;
  /** Exact browser origins allowed to open a socket. */
  origins: string[];
  authenticator: ConnectionAuthenticator;
  app: App;
};
type SocketData = { user: PublicUser; token: string; connection?: Connection };

/**
 * The HTTP/WebSocket edge. The handshake authenticates the session cookie before upgrading, so an
 * unauthenticated client never gets a socket; everything after that is the app's dispatcher.
 */
export function startServer({ port, origins, authenticator, app }: Options) {
  const server = Bun.serve<SocketData>({
    port,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (url.pathname === '/health') return Response.json({ status: 'ok' });
      if (url.pathname !== '/ws' || url.search) return new Response(null, { status: 404 });
      if (!origins.includes(request.headers.get('origin') ?? ''))
        return new Response(null, { status: 403 });
      const token = sessionToken(request);
      if (!token) return new Response(null, { status: 401 });
      const result = await authenticator.authenticate(token);
      if (result.status === 'unavailable') return new Response(null, { status: 503 });
      if (result.status === 'unauthenticated') return new Response(null, { status: 401 });
      if (server.upgrade(request, { data: { user: result.user, token } })) return;
      return new Response(null, { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      idleTimeout: 60,
      backpressureLimit: 64 * 1024,
      closeOnBackpressureLimit: true,
      open(ws) {
        const { user, token } = ws.data;
        ws.data.connection = new Connection(crypto.randomUUID(), user, token, ws, app.clock());
        app.connections.add(ws.data.connection);
      },
      message(ws, raw) {
        if (ws.data.connection) void app.dispatcher.dispatch(ws.data.connection, raw);
      },
      close(ws) {
        const { connection } = ws.data;
        if (!connection) return;
        connection.markClosed();
        app.connections.remove(connection);
      },
    },
  });
  app.start();
  return {
    server,
    stop() {
      app.stop();
      // Bun 1.3.14 may leave stop's promise pending after server-initiated closes; the listener
      // is closed synchronously, so the promise is not awaited.
      void server.stop();
    },
  };
}
