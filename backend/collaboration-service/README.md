# Collaboration Service

Bun 1.3.14 and TypeScript native WebSocket service for workspace presence and messages. Start with `bun install --frozen-lockfile && bun start`, or use the root Compose stack. The design and its limits are in [ADR-005](../../docs/adr/ADR-005-workspace-presence.md).

The service owns no workspace data. It asks the Auth service who a session cookie belongs to and the Workspace service whether that user may be in a workspace.

## Configuration

| Variable                 | Default                                       | Meaning                                                             |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------- |
| `PORT`                   | `3001`                                        | Listening port                                                      |
| `APP_ORIGINS`            | `http://127.0.0.1:8080,http://localhost:8080` | Exact browser origins allowed to open a socket                      |
| `AUTH_SERVICE_URL`       | `http://localhost:8000`                       | Verifies the session token (`GET /auth/me`)                         |
| `WORKSPACE_SERVICE_URL`  | `http://localhost:8083`                       | Membership check (`GET /api/workspaces/{id}/membership`)            |
| `UPSTREAM_TIMEOUT_MS`    | `5000`                                        | Timeout of both upstream calls; a timeout counts as unavailable     |
| `HEARTBEAT_INTERVAL_MS`  | `15000`                                       | Expected client heartbeat interval; the monitor sweeps at this rate |
| `HEARTBEAT_MAX_MISSED`   | `3`                                           | Silent intervals before a connection is dropped                     |
| `REVALIDATE_INTERVAL_MS` | `30000`                                       | How often joined rooms are checked against the Workspace service    |

`GET /health` is public. `/ws` requires an allowed Origin and the `marksync_session` HttpOnly cookie, validated before the upgrade. Tokens are never read from URLs and are never logged or broadcast.

## Protocol

JSON text frames, at most 16 KiB. Types, close codes and validation are in `src/protocol.ts`; the frontend keeps a copy in `frontend/src/presence/protocol.ts` and `tests/frontend-protocol.test.ts` fails if they differ.

Client to server:

- `{ "type": "join", "workspaceId": 7 }`: join a workspace room. Always checked with the Workspace service.
- `{ "type": "leave", "workspaceId": 7 }`
- `{ "type": "heartbeat" }`
- `{ "type": "message", "workspaceId": 7, "text": "hello" }`: 1 to 2000 characters; the sender must have joined `workspaceId`.

Server to client:

- `{ "type": "presence", "workspaceId": 7, "users": [{ "id": 1, "displayName": "ada" }] }`: the complete list of who is online, sent to the room on every join, leave and disconnect.
- `{ "type": "message", "workspaceId": 7, "sender": { "id": 1, "displayName": "ada" }, "text": "hello", "sentAt": "..." }`: relayed to the whole room, the sender included.
- `{ "type": "heartbeat" }`: the answer to a heartbeat.
- `{ "type": "error", "code": "...", "message": "...", "workspaceId": 7 }`: `INVALID_MESSAGE` and `NOT_JOINED` keep the connection open; `FORBIDDEN`, `UNAUTHENTICATED` and `UNAVAILABLE` remove the connection from the room and are followed by a close when it has no room left.

Close codes: `4401` sign in again, `4403` no access or access revoked, `4408` heartbeat timeout, `1012` server shutting down, `1013` try again later. Clients must not reconnect after 4401 or 4403.

## Structure

`src/app.ts` is the only place objects are wired together. `server.ts` is the HTTP/WebSocket edge; the dispatcher validates each frame and runs one handler per message type (`src/handlers/`), so adding a type adds a handler and nothing else. `RoomManager`, `PresenceRegistry` (interface, in-memory implementation), `HeartbeatMonitor`, `AccessRevalidator` and `AccessEnforcer` each do one job.

Bun 1.3.14 delivers a server-sent close code of 1001 to clients as 1000, so shutdown uses 1012.

## Verification

`bun run typecheck`, `bun run format:check`, and `bun test`. Unit tests use fake connections, injected clocks and fake timers. `tests/integration.test.ts` opens real sockets for two different accounts against stubbed Auth and Workspace services and uses the real HTTP clients: both see each other online, messages flow both ways, a non-member is rejected, and a removed member is evicted. End-to-end tests with the real services run from `frontend` (see the root README).
