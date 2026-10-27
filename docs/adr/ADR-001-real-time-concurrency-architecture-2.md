# ADR-001: Real-Time Concurrency Architecture

- **Status:** Proposed (to become *Accepted* when this PR is merged after peer review)
- **Date:** 2026-10-24
- **Deciders:** MarkSync team
- **Related:** [ADR-002: Application Stack and Document Storage](ADR-002-application-stack-and-document-storage.md)

## Context

MarkSync is a collaborative Markdown platform that allows multiple users to edit the same document simultaneously and produce the same output, even when conflicting edits, out-of-order edits or client reconnects happen.

Two separate questions have to be answered, and they influence each other:

1. **Algorithm:** how do concurrent edits converge? (CRDT or OT)
2. **Topology:** who talks to whom? (client-server with an authoritative relay, or peer-to-peer with the cloud as a backup)

Influences on the choice:

- **Convergence and intent preservation.** Typing in the same paragraph should not lead to loss or scrambling of characters.
- **Access control.** Documents belong to workspaces. The allowed set of readers and editors for documents is configurable and can be dynamically revoked during a session. Identity information is passed to the Collaboration service via JWT from the Authentication service.
- **Persistence and versioning.** The Document service manages the metadata and versions of the document. Content of the document is needed by the AI and Notification services.
- **Reconnections.** Mobility and flaky connections mean that clients are going to reconnect in the middle of their sessions.
- **Team constraints.** Three people in the team, one module, no previous experience with collaborative editor development. The system must be deployable on a developer machine and easy to check by the marker.
- **Existing choices.** The Collaboration service is TypeScript (see ADR-002) and the frontend is React with TypeScript, so a native JavaScript solution would have a considerable advantage.
- **Task scope.** Task 1 needs only a bi-directional WebSocket with a live roster or heartbeat of participants. Task 2 needs full concurrent editing of characters. The choice cannot prevent the completion of Task 2.

### Decision 1: convergence algorithm

| Criterion | CRDT: Yjs | CRDT: Automerge | OT: ShareDB |
|---|---|---|---|
| Convergence model | Merge is commutative and idempotent. Updates can arrive in any order, or twice | Same family, with a full JSON document and complete history | Operations must be transformed against concurrent ones. A server serialises them into one order |
| Needs a central server to be correct | No. A server is optional and is used for persistence and relaying | No | Yes. Correctness depends on the server's total order |
| Reconnect and offline edits | Built in. Clients exchange state vectors and send only the missing updates | Built in | Possible, but the client must rebase pending operations. This is the most fragile part of OT |
| Implementation burden for us | Low. We reuse the library's sync protocol and do not write transform functions | Low to medium | Medium. We rely on the library's text type, and any custom operation type needs correct transform functions |
| Editor bindings (browser) | Mature bindings for CodeMirror 6 and ProseMirror | Fewer, less established bindings for text editors | Needs a binding and an operation-to-editor adapter |
| Presence and cursors | Awareness protocol included | Not included | Not included |
| Metadata and memory overhead | Grows with edit history (tombstones). Mitigated by garbage collection and snapshots | Keeps the full history, so overhead is higher | Small document state, but an operation log is kept |
| Server-side access to plain text | Easy: read the text type from the document | Easy | Easy: the document is the snapshot |
| Storage fit with our stack | Binary updates and snapshots fit MongoDB well | Binary | Has a MongoDB adapter, which is a genuine point in its favour |
| Maturity and community | Large, widely adopted for collaborative editors | Strong research pedigree, smaller editor ecosystem | Mature, but a smaller community than Yjs |

**Compromises in CRDTs.** The state and history are evolving structures that require snapshots and compaction. The convergence ensures that the *character string* is the same for all clients, but not necessarily that the *Markdown is correct*: two users who both surround the same word in `**` can generate syntactically invalid Markdown. Therefore, the parser has to deal with any possible input and never fail.

### Decision 2: network topology

| Criterion | Client-server with authoritative relay | Peer-to-peer (WebRTC) with cloud fallback |
|---|---|---|
| Authentication and authorisation | One enforcement point: validate the JWT at the WebSocket handshake and check workspace permission. Revocation closes the socket | Hard. A peer that already holds the document cannot be made to forget it. Each peer would have to be trusted |
| Persistence and versioning | The server persists as updates arrive | Requires a peer that always acts as a server, which makes it client-server again |
| NAT and firewall traversal | Not an issue (outbound WebSocket) | Needs STUN and TURN servers. In practice TURN relays traffic, so a server is needed anyway |
| AI, notifications and events | The server sees every update and can emit events to Kafka | The server sees nothing unless it joins as a peer |
| Latency | One extra hop through the server | Lowest when a direct connection is possible |
| Scaling profile | The server is a bottleneck, but it can be scaled out per document | Scales with peers for small groups, but degrades as fan-out grows (every peer talks to every peer) |
| Testability and demo | A single endpoint. Easy to test and easy for a marker to verify bi-directional flow | Harder to reproduce locally and to automate in CI |

Definition of the term "authoritative" is essential in the context. The server **cannot** be viewed as an authoritative source of conflict resolution for a CRDT, since the merge operation is commutative. The server is authoritative with respect to **the connection, persistence and publication**.

## Decision

1. **Convergence: Yjs (CRDT).** Every document has its Yjs document representation with just one text type containing the raw Markdown. For the frontend we have the CodeMirror 6 binding.
2. **Topology: client-server with an authoritative relay over native WebSockets.** The Collaboration service is the only real-time endpoint, which:
   - validates the JWT at the time of the WebSocket handshake and verifies the permission for the document with the Workspace service;
   - relays Yjs sync and awareness messages between the clients connected to the same document;
   - closes the WebSocket when the `permission.changed` event denies access to the document;
   - persists the state of the document (see below) and emits events.
3. **Protocol implementation.** Our Collaboration service directly uses the Yjs sync and awareness protocols, thus keeping the JWT checks and permissions in our code. As the alternative, if the custom relay turns out to be too expensive in Task 2, we can consider a ready-made solution like Hocuspocus.
4. **State ownership and persistence.**
   - The Collaboration service owns the Yjs binary state (updates and snapshots) in **MongoDB**.
   - The Document service owns the metadata and the current Markdown text of the document in **PostgreSQL**.
   - The Collaboration service sends the current Markdown as a debounced Kafka message from the Document service upon editing pauses or when the last client disconnects. As long as there is no live editing in Task 1 (Task 1 skeleton), the documents are persisted through the REST API of the Document service.
5. **Presence in Task 1.** The skeleton relies on the explicit `join`, `leave` and `ping`/`pong` messages exchanged via the same WebSocket, with the server broadcasting the list of the active users. This makes the transport consistent with the needs of Task 2. In Task 2, presence will be transferred to the Yjs awareness protocol without changing the connection.

## Consequences

**Positive**

- No transform functions are needed for writing and debugging.
- The concept of reconnecting and offline editing is built in.
- There is only one point where authentication, authorisation and persistence happen, which is a good fit for a JWT-based, microservice architecture.
- The Collaboration service can broadcast any document events to the AI service and Notification service.
- Using a single WebSocket connection is easy to test and run locally using Docker Compose.

**Negative and risks**

- CRDT state gets bigger as more edits happen. Snapshotting and garbage collection are necessary, and we have to make a decision regarding compaction.
- Merged Markdown documents are not valid. The renderer has to tolerate malformed documents; the same applies to future AST-related functions.
- The relay works as a single-process application. Its scaling requires sticky routing by document ID or a fan-out approach between relay instances (for example using Kafka). It is out of scope until load testing proves its necessity.
- A user whose permissions get revoked will keep an active socket until the `permission.changed` event gets processed, resulting in eventual consistency.
- There are two databases that store document content (CRDT state stored in MongoDB and the latest text in PostgreSQL). The synchronisation via Kafka allows for a brief lag of PostgreSQL relative to the live state.
- The development team has to understand the data model used in the Yjs library. A quick spike in Task 2 will verify the CodeMirror binding in the React frontend.

**Follow-ups**

- Convergence tests for the Collaboration service: apply the same series of modifications to two separate copies of a document in different sequences and expect the same text. Add them to the current `collaboration-service` CI job (only type checks right now).
- Malformed-Markdown test set for the renderer.
- Hocuspocus versus our relay comparison after the Task 2 spike.
- Benchmark document size change and compaction performance before deciding on snapshot frequency.
- Test the maximum number of editors per document supported by one relay, using the load-testing tool selected in ADR-002.

## AI Prompt Appendix

### Prompts used

Rows 1 to 3 come from prior MarkSync sessions with ChatGPT. These set the architectural backdrop but do not make comparisons between CRDTs versus OT or relay versus peer-to-peer communication, and it was impossible to find an earlier prompt where these were compared verbatim. Row 4 is a subsequent consultation with Claude.

| # | Prompt (verbatim) | AI tool and date | What we took from the answer |
|---|---|---|---|
| 1 | “can you create a simple use case diagram for Notion to get inspired to build MarkSync” | ChatGPT, 19 October 2026 | We explored the collaborative-document use cases and the need to separate user-facing operations from real-time communication. This established context; it did **not** itself choose a concurrency algorithm |
| 2 | “sequence diagram” | ChatGPT, 19 October 2026 | We explored interactions among clients and services, including the role of a real-time communication channel. A diagram is a design aid, not proof that a chosen synchronisation algorithm works |
| 3 | “do you remember the stack used, architectures, and other tech stack” | ChatGPT, 19 October 2026 | ChatGPT revisited the agreed distributed architecture, including WebSockets and event-driven communication. We then treated Yjs/CRDT versus OT and relay versus peer-to-peer as separate decisions to justify in this ADR |
| 4 | “do you think we made all the requirement apart from the walking skeleton” | Claude, 25 October 2026 | A requirement-by-requirement check against the brief. It pointed out that our prompt log did not cover the trade-offs in this ADR and that our commentary overstated ChatGPT's role, so we rewrote this appendix |

### Critical commentary

Claude's greatest contribution was to divide the problem into two decisions, a convergence algorithm and a network topology, and then emphasise that when using a CRDT, the server does not decide about conflict resolution but rather about whom to allow to connect, what to persist and which events to publish. Using a proven library, Yjs, will reduce the amount of concurrency logic a team of three people would need to write and debug. The disadvantages of his answer are that the tables describing the comparison of Yjs, Automerge and ShareDB (editor bindings, memory overhead, reconnect behaviour) make some claims which we are not sure whether they are true based on our verification. Also, judging the implementation burden of a hand-written Yjs relay with JWT handshake and permission revocation as "low" is rather optimistic. Moreover, the fact that it treats the validity of Markdown after merging and revoking of WebSocket as risks without having evidence that our editor and renderer deal with them is a disadvantage as well. As the previous prompts for ChatGPT only gave the context, none of the AI answers replaced any test. Therefore, we note Yjs and client-server relay as chosen options which should be validated through a Yjs and CodeMirror spike as well as convergence testing of reordered and duplicated updates.
