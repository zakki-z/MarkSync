# Collaboration Service

Bun 1.3.14 and TypeScript native WebSocket presence for Task 1. Start with `bun install --frozen-lockfile && bun start`, or use the root Compose stack. Environment: `PORT` (3001), `APP_ORIGINS`, `AUTH_SERVICE_URL`, and `DOCUMENT_SERVICE_URL`; see the root README for values.

`GET /health` is public. `/ws` requires an explicitly allowed Origin and the `marksync_session` HttpOnly cookie, validated against FastAPI before upgrade. Tokens are never sent in URLs or logged. Each join asks the Document Service to verify the user's ownership. Production documents are private.

## Protocol

All frames are JSON text with the exact shapes below. Types and validation are in `src/protocol.ts`.

Client → server:

- `{ "type": "join", "documentId": 123 }` — join a positive safe-integer document ID, replacing any previous room.
- `{ "type": "leave" }` — remove this connection from its room.
- `{ "type": "ping" }` — application heartbeat.

Server → client:

- `{ "type": "ready" }` — authenticated upgrade completed.
- `{ "type": "presence", "documentId": 123, "users": [{ "id": 1, "email": "owner@example.com", "sessions": 2 }] }` — complete roster, including the sender; one entry per identity.
- `{ "type": "pong" }` — heartbeat reply.
- `{ "type": "error", "code": "DOCUMENT_UNAVAILABLE", "message": "Document unavailable." }` — followed by close. Other codes: `INVALID_MESSAGE`, `UNAUTHORIZED`, `SERVICE_UNAVAILABLE`.

The client sends a heartbeat every 15 seconds. The server sweeps every 15 seconds, closes connections idle for over 45 seconds, and revalidates auth and room access. Revoked/expired credentials, deleted documents, and upstream failures remove presence. Close code 4401 means sign in again; other application rejections use 1008. Messages are limited to 1 KiB and outbound backpressure is bounded. Async joins are invalidated by leave, switching, or disconnect to prevent ghost entries.

Presence is in memory in one process. A service restart clears it; the frontend offers reconnect on failure. No distributed state, text synchronization, or sharing is implemented. Auth uses stateless tokens: logout clears the browser session; an already-open socket in another tab can remain valid until token expiry unless it disconnects.

## Verification

`bun run typecheck`, `bun run format:check`, and `bun test`. Tests open actual local sockets with isolated authorization fixtures, including a two-identity room to exercise the roster independently of the production owner-only policy. End-to-end tests use real Auth and Documents through Nginx.

Bun 1.3.14 can leave `server.stop()`'s promise pending after a server-initiated WebSocket close, although the client and listener close. Shutdown invokes `stop(true)` without awaiting that promise; a regression test verifies socket closure and refusal of new connections. Presence cleanup itself is explicit and tested.
