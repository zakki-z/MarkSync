import type { App } from './app';
import { Connection } from './connection';
import { sessionToken, type ConnectionAuthenticator } from './connection-authenticator';
import { MAX_BINARY_FRAME_BYTES, type PublicUser } from './protocol';

type Options = {
  port: number;
  /** Exact browser origins allowed to open a socket. */
  origins: string[];
  authenticator: ConnectionAuthenticator;
  app: App;
};
type SocketData = { user: PublicUser; token: string; connection?: Connection };

const MARKDOWN_STATUS = { denied: 403, unauthenticated: 401, unavailable: 503 } as const;

/**
 * `GET /documents/{id}/markdown`: the document's current text for the Next.js server, which merges
 * it into REST responses. The caller's bearer token (if any) is checked like a WebSocket join; no
 * cookie is read, so a browser cannot be made to call this on a user's behalf.
 */
async function serveMarkdown(app: App, request: Request, documentId: number) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  const result = await app.markdown.read(token, documentId);
  if (result.status !== 'granted')
    return new Response(null, { status: MARKDOWN_STATUS[result.status] });
  return new Response(result.markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

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
      const markdownRoute = url.pathname.match(/^\/documents\/([1-9]\d{0,14})\/markdown$/);
      if (markdownRoute) return serveMarkdown(app, request, Number(markdownRoute[1]));
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
      // Text frames are limited further by the parser; this bounds Yjs binary frames.
      maxPayloadLength: MAX_BINARY_FRAME_BYTES,
      idleTimeout: 60,
      // Large enough for the full state of the largest document in one frame.
      backpressureLimit: 2 * MAX_BINARY_FRAME_BYTES,
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
    /** Stops listening at once; resolves when buffered edits are stored. */
    stop() {
      // Bun 1.3.14 may leave stop's promise pending after server-initiated closes; the listener
      // is closed synchronously, so the promise is not awaited.
      void server.stop();
      return app.stop();
    },
  };
}
