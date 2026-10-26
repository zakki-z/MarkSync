# ADR-001: Real-Time Concurrency Architecture

- **Status:** Proposed (to become *Accepted* when this PR is merged after peer review)
- **Date:** 2026-10-24
- **Deciders:** MarkSync team
- **Related:** [ADR-002: Application Stack and Document Storage](ADR-002-application-stack-and-document-storage.md)

## Context

MarkSync is a real-time collaborative Markdown platform. Several users must be able to edit the same document at the same time and end up with the same text, even when edits conflict, arrive out of order, or a client drops and reconnects.

Two separate questions have to be answered, and they interact:

1. **Algorithm:** how do concurrent edits converge? (CRDT or Operational Transformation)
2. **Topology:** who talks to whom? (client-server with an authoritative relay, or peer-to-peer with a cloud fallback)

The forces that shape the answer:

- **Convergence and intent preservation.** Concurrent typing in the same paragraph must not lose or scramble text.
- **Access control.** Documents belong to workspaces. Only permitted users may read or edit them, and access can be revoked while a session is open. Identity is carried by JWTs issued by the Authentication service.
- **Persistence and versioning.** The Document service owns document metadata and versions. The AI and Notification services need server-side visibility of document content and events.
- **Reconnects.** Mobile and flaky networks mean clients will regularly drop and rejoin mid-session.
- **Team constraints.** Three people, one module, no prior experience building a collaborative editor. The system must be fully runnable locally and be easy for a marker to verify.
- **Existing decisions.** The Collaboration service is TypeScript (see ADR-002) and the frontend is React with TypeScript, so a JavaScript-native solution has a real advantage.
- **Scope by task.** Task 1 only needs a bi-directional WebSocket with a live presence roster or heartbeat. Full concurrent character editing is Task 2. The choice made now must not block Task 2.

### Decision 1: convergence algorithm

| Criterion | CRDT: Yjs | CRDT: Automerge | OT: ShareDB |
|---|---|---|---|
| Convergence model | Merge is commutative and idempotent. Updates can arrive in any order, or twice. | Same family, with a full JSON document and complete history. | Operations must be transformed against concurrent ones. A server serialises them into one order. |
| Needs a central server to be correct | No. A server is optional and is used for persistence and relaying. | No. | Yes. Correctness depends on the server's total order. |
| Reconnect and offline edits | Built in. Clients exchange state vectors and send only the missing updates. | Built in. | Possible, but the client must rebase pending operations. This is the most fragile part of OT. |
| Implementation burden for us | Low. We reuse the library's sync protocol and do not write transform functions. | Low to medium. | Medium. We rely on the library's text type, and any custom operation type needs correct transform functions. |
| Editor bindings (browser) | Mature bindings for CodeMirror 6 and ProseMirror. | Fewer, less established bindings for text editors. | Needs a binding and an operation-to-editor adapter. |
| Presence and cursors | Awareness protocol included. | Not included. | Not included. |
| Metadata and memory overhead | Grows with edit history (tombstones). Mitigated by garbage collection and snapshots. | Keeps the full history, so overhead is higher. | Small document state, but an operation log is kept. |
| Server-side access to plain text | Easy: read the text type from the document. | Easy. | Easy: the document is the snapshot. |
| Storage fit with our stack | Binary updates and snapshots fit MongoDB well. | Binary. | Has a MongoDB adapter, which is a genuine point in its favour. |
| Maturity and community | Large, widely adopted for collaborative editors. | Strong research pedigree, smaller editor ecosystem. | Mature, but a smaller community than Yjs. |

**Trade-offs we accept with a CRDT.** State and history grow over time and need snapshot and compaction. Convergence guarantees the *character sequence* is identical on every client, not that the *Markdown is valid*: two users who both wrap the same word in `**` can produce syntactically odd Markdown. The renderer therefore has to tolerate any input and must never throw on a malformed document.

### Decision 2: network topology

| Criterion | Client-server with authoritative relay | Peer-to-peer (WebRTC) with cloud fallback |
|---|---|---|
| Authentication and authorisation | One enforcement point: validate the JWT at the WebSocket handshake and check workspace permission. Revocation closes the socket. | Hard. A peer that already holds the document cannot be made to forget it. Each peer would have to be trusted. |
| Persistence and versioning | The server persists as updates arrive. | Requires a peer that always acts as a server, which makes it client-server again. |
| NAT and firewall traversal | Not an issue (outbound WebSocket). | Needs STUN and TURN servers. In practice TURN relays traffic, so a server is needed anyway. |
| AI, notifications and events | The server sees every update and can emit events to Kafka. | The server sees nothing unless it joins as a peer. |
| Latency | One extra hop through the server. | Lowest when a direct connection is possible. |
| Scaling profile | The server is a bottleneck, but it can be scaled out per document. | Scales with peers for small groups, but degrades as fan-out grows (every peer talks to every peer). |
| Testability and demo | A single endpoint. Easy to test and easy for a marker to verify bi-directional flow. | Harder to reproduce locally and to automate in CI. |

"Authoritative" needs a precise meaning here. With a CRDT, the server is **not** the authority on how conflicts resolve, because merging is commutative. It is the authority on **who may connect, what is persisted, and what events are published**.

## Decision

1. **Convergence: Yjs (CRDT).** Each document is a Yjs document with one text type holding the raw Markdown. We use the CodeMirror 6 binding in the React frontend.
2. **Topology: client-server with an authoritative relay over native WebSockets.** The Collaboration service is the single real-time endpoint. It:
   - validates the JWT during the WebSocket handshake and checks permission for the document with the Workspace service;
   - relays Yjs sync and awareness messages between clients on the same document;
   - closes sockets when a `permission.changed` event revokes access;
   - persists document state (see below) and publishes events.
3. **Protocol implementation.** We use the Yjs sync and awareness protocol packages directly inside our own Collaboration service, so JWT checks and permission hooks stay in our code. A ready-made server such as Hocuspocus is the fallback if the hand-rolled relay proves too costly in Task 2.
4. **State ownership and persistence.**
   - The Collaboration service owns the Yjs binary state (updates and periodic snapshots) in **MongoDB**.
   - The Document service owns document metadata and the latest plain Markdown text in **PostgreSQL**.
   - The Collaboration service sends the latest plain Markdown to the Document service as a debounced Kafka event when editing pauses or the last client leaves. Until live editing exists (Task 1 skeleton), documents are saved through the Document service's REST API.
5. **Presence in Task 1.** The skeleton uses explicit `join`, `leave` and `ping`/`pong` messages over the same WebSocket, with the server broadcasting the active-user roster. This keeps the transport identical to what Task 2 needs. In Task 2, presence moves to the Yjs awareness protocol without changing the connection.

## Consequences

**Positive**

- No transform functions to write or debug. Convergence is a property of the library.
- Reconnect and offline edits work by design.
- One place enforces authentication, authorisation and persistence, which suits a JWT-based, microservice system.
- The Collaboration service can publish document events for the AI and Notification services.
- A single WebSocket endpoint is easy to demonstrate, test and run locally with Docker Compose.

**Negative and risks**

- CRDT state grows with edit history. We need snapshotting and garbage collection, and a policy for when to compact.
- Markdown validity is not guaranteed after merges. The renderer and any future AST features must handle malformed input gracefully.
- The relay is a single process for now. Scaling it out needs either routing by document ID (sticky) or fan-out between instances (for example through Kafka). This is out of scope until load testing shows it is needed.
- A revoked user can keep a socket until the `permission.changed` event is processed, so there is a short window of eventual consistency.
- Two stores hold document content (MongoDB for CRDT state, PostgreSQL for the latest text). The Kafka-driven sync means PostgreSQL can briefly lag the live state.
- The team must learn the Yjs data model. A short spike in Task 2 will confirm the CodeMirror binding works inside the React frontend.

**Follow-ups**

- Add convergence tests to the Collaboration service: apply the same set of updates to two documents in different orders and assert identical text. Extend the existing `collaboration-service` CI job to run them (it currently only type-checks).
- Add a malformed-Markdown test set for the renderer.
- Revisit Hocuspocus versus our own relay after the Task 2 spike.
- Benchmark document growth and compaction before choosing snapshot frequency.
- Verify, with the load-testing tool chosen in ADR-002, how many concurrent editors one relay instance can hold per document.

## AI Prompt Appendix

### Prompts used

Rows 1 to 3 are from our earlier MarkSync conversations with ChatGPT. They set the architectural context but did not themselves compare CRDTs with OT or relay with peer-to-peer, and we could not verify a verbatim earlier prompt dedicated to that comparison. Row 4 is a later consultation with Claude.

| # | Prompt (verbatim) | AI tool and date | What we took from the answer |
|---|---|---|---|
| 1 | “can you create a simple use case diagram for Notion to get inspired to build MarkSync” | ChatGPT, 19 October 2026 | We explored the collaborative-document use cases and the need to separate user-facing operations from real-time communication. This established context; it did **not** itself choose a concurrency algorithm. |
| 2 | “sequence diagram” | ChatGPT, 19 October 2026 | We explored interactions among clients and services, including the role of a real-time communication channel. A diagram is a design aid, not proof that a chosen synchronisation algorithm works. |
| 3 | “do you remember the stack used, architectures, and other tech stack” | ChatGPT, 19 October 2026 | ChatGPT revisited the agreed distributed architecture, including WebSockets and event-driven communication. We then treated Yjs/CRDT versus OT and relay versus peer-to-peer as separate decisions to justify in this ADR. |
| 4 | “do you think we made all the requirement apart from the walking skeleton” | Claude, 25 October 2026 | A requirement-by-requirement check against the brief. It pointed out that our prompt log did not cover the trade-offs in this ADR and that our commentary overstated ChatGPT's role, so we rewrote this appendix. |

### Critical commentary

Claude's most useful contribution was to split the problem into two separate decisions, a convergence algorithm and a network topology, and to point out that with a CRDT the server is not the authority on conflict resolution but on who may connect, what is persisted and which events are published. Choosing a mature library, Yjs, also reduces the concurrency logic a three-person team has to write and debug ourselves. Its weaker points are that the comparison tables state properties of Yjs, Automerge and ShareDB (editor bindings, memory overhead, reconnect behaviour) with more confidence than we have verified, and that rating a hand-written Yjs relay with JWT handshake checks and permission revocation as "low" implementation burden is optimistic. It also treated Markdown validity after merges and WebSocket revocation as listed risks without any evidence that our editor and renderer cope. The earlier ChatGPT prompts only supplied context, so none of the AI output replaces a test. We therefore record Yjs and a client-server relay as proposed choices, to be validated by a small Yjs and CodeMirror integration spike and convergence tests on reordered and duplicate updates before we treat them as settled.
