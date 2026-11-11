# ADR-005: Workspace Presence and Messaging

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** [ADR-001](ADR-001-real-time-concurrency-architecture-2.md), [ADR-003](ADR-003-workspace-document-authorization.md), [ADR-004](ADR-004-invitations-and-membership.md)

## Context

ADR-001 gave the Collaboration service a Task 1 presence feature scoped to a single owner's document. With workspaces, roles and invitations (MS-02, MS-03), several accounts can now share a workspace, so presence must be scoped to workspaces and enforce workspace membership. Revoked members must lose access while connected. The same connection and authorization layer must later carry Yjs document rooms (MS-05).

## Decision

- **Rooms are workspaces.** A connection joins `workspaceId` rooms. This replaces the document-owner rooms of Task 1; the old `join {documentId}`, `ping`/`pong` and email-based roster are gone.
- **The Collaboration service owns no workspace data.** It asks the Workspace service whether a user may join through the `WorkspaceAccessChecker` interface (`GET /api/workspaces/{id}/membership` with the user's own token, which the Workspace service already accepts). Any role may join; a `404` means non-member. A timeout, error or outage is refusal (fail closed). Identity comes from `GET /auth/me` through `ConnectionAuthenticator` during the handshake, and only the id and username are kept; the username is the public display name.
- **One typed, validated protocol.** A discriminated union (`join`, `leave`, `heartbeat`, `presence`, `message`, `error`) is validated by a hand-written parser that rejects unknown types, extra fields and oversized frames. Malformed frames get an `INVALID_MESSAGE` error and the connection stays open. The frontend keeps a copy of the protocol file because services are built from separate Docker contexts without a shared package; a collaboration-service test imports the copy and fails on drift.
- **Handler per message type.** A dispatcher looks up a `MessageHandler` by type, so a new type (for example Yjs sync in MS-05) adds a handler class, not a dispatcher change. Frames of one connection run in order, so a `leave` cannot overtake the `join` before it.
- **Presence behind `PresenceRegistry`.** The in-memory implementation counts connections per user, so a user with several tabs is online until the last tab leaves. Presence lists contain only user id and display name.
- **Heartbeat.** Clients send a heartbeat every 15 s and the server answers it. Any frame counts as activity; the `HeartbeatMonitor` closes a connection silent for more than 3 intervals (4408) and removes it from its rooms, which updates the others. The client treats unanswered heartbeats as a dead connection even if the browser never reports a close.
- **Revoked access by revalidation, not events.** The repository has no Kafka producer or consumer to build on, and adding one would reach into MS-03 code. Instead, every join is checked afresh, and an `AccessRevalidator` re-checks every joined room each `REVALIDATE_INTERVAL_MS` (30 s by default, 10 s in Compose). One sweep asks once per token and workspace however many tabs share them. A refused answer removes the connection from the room, sends `FORBIDDEN` and, when no room is left, closes with 4403; an expired token closes with 4401. An unavailable Workspace service also evicts (closing with 1013, which clients retry), because assuming access during an outage would let removed members stay.
- **Close codes are named constants** shared with the frontend: 4401 unauthenticated, 4403 forbidden or revoked, 4408 heartbeat timeout, 1012 shutdown, 1013 try later. Shutdown uses 1012 because Bun 1.3.14 delivers a server-sent 1001 to clients as 1000. The frontend does not reconnect after 4401 or 4403; every other loss reconnects with exponential backoff (1 s doubling to 30 s) and jitter, and joins again.
- **Composition in one place.** `createApp` builds the objects; tests substitute the access checker, clocks and timers.

## Consequences

- Revocation takes effect within one revalidation interval, not instantly, and a Workspace service outage briefly disconnects everyone (they reconnect once it is back). The cost is one membership call per user and workspace per interval.
- Presence is in the memory of one instance. Running several instances would give each its own view, and a restart clears presence (clients reconnect and rejoin). Horizontal scaling needs either sticky routing by workspace id or a shared registry: a Redis-backed `PresenceRegistry` with pub/sub for cross-instance broadcast is the intended path, with the Workspace service publishing membership changes to Kafka so evictions are immediate instead of polled. Neither is built.
- Chat messages are relayed and not stored; a client that was offline misses them.
- Display names are usernames, which are unique in the Auth service; no email or token is exposed to other members.
- Anonymous visitors of public documents and authenticated non-members get no presence.
- MS-05 can add document-level rooms by extending the room key and adding handlers for Yjs sync and awareness; authentication, access enforcement, heartbeat and revalidation apply unchanged.
