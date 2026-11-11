# ADR-006: Collaborative Synchronization with Yjs

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** [ADR-001](ADR-001-real-time-concurrency-architecture-2.md), [ADR-002](ADR-002-application-stack-and-document-storage-2.md), [ADR-003](ADR-003-workspace-document-authorization.md), [ADR-005](ADR-005-workspace-presence.md)

## Context

ADR-001 chose Yjs over a relay we own and ADR-002 chose MongoDB for Yjs state, but both deferred the implementation. MS-05 delivers it: several users edit one Markdown document at the same time without lost updates, see each other's cursors, recover from disconnects, and keep their changes across restarts. MS-04 already provides the authenticated WebSocket, the handler registry, heartbeat and revalidation, and MS-02/MS-03 provide the document access rules.

## Decision

### Why Yjs, and what we did not build

Yjs is a CRDT, so concurrent edits converge on every client whatever the order of delivery, and a reconnecting client brings both sides level with one state-vector exchange. The service relays and stores Yjs updates and uses `yjs` and `y-protocols` (sync and awareness) for everything protocol related; the browser uses `y-codemirror.next`. There is no custom CRDT or merge code. Convergence guarantees the text, not valid Markdown: the preview already tolerates any input.

### Protocol on the existing connection

Document rooms are added to the MS-04 WebSocket, handled by new `MessageHandler`s registered in `createApp`; nothing in the dispatcher, authentication, heartbeat or close codes changed.

- **Control in JSON text frames** (16 KiB limit, as before): `document-join`, `document-leave`, and from the server `document-access {documentId, canEdit}`, sent after a successful join and whenever the permission changes. Errors carry a `documentId`.
- **Yjs in binary frames** (4 MiB limit): `[varuint documentId][varuint kind][y-protocols message]`, kind 0 sync, kind 1 awareness. The parser turns a frame into a typed message (`document-sync`, `document-awareness`), so the registry dispatches both kinds like any other type. `frontend/src/collab/frames.ts` mirrors the codec and a test fails on drift.
- The handshake is the standard one. After `document-access` the client sends sync step 1; the server has sent its own step 1 after joining; each answers with step 2. Updates are then relayed to every other member.
- The browser opens a second socket for the document next to the workspace presence socket, using the same endpoint, cookie and backoff. Sharing one socket would have required reworking the tested presence client for little gain.

### Authorization

The collaboration service owns no access rules. A join asks the Document service `GET /api/documents/{id}` with the user's own token, which applies `DocumentAccessPolicy` and answers with `canEdit`: `200` means read access (members of any role, and anyone for a `PUBLIC` document), `401` expired token, `403`/`404` refused, anything else unavailable, which refuses (fail closed). Consequences:

- Non-members of a private document are refused; a non-member can join a public document and gets `canEdit: false`.
- **Read-only is enforced on the server.** A connection without edit permission may ask for state (step 1) but every update or step 2 from it is dropped, never applied, and it is told it is read-only. The editor is also set read-only in the browser, but that is a convenience.
- **Revalidation** is the MS-04 `AccessRevalidator`, extended to joined documents: one check per token and document per sweep. A user whose answer is still granted but whose `canEdit` changed is switched (and told with `document-access`); a refusal removes them from the document, sends `FORBIDDEN` and closes with `4403` (`4401` for an expired token, `1013` when the Document service is down) when nothing else is joined.

### Persistence model

Behind the `DocumentPersistence` interface (`load`, `append`, `compact`), with a MongoDB adapter and an in-memory fake that run the same contract tests.

| Collection | Document | Notes |
| --- | --- | --- |
| `yjs_updates` | `{documentId, seq, update (binary), createdAt}` | Append-only. `seq` increases per document; unique index on `(documentId, seq)` so two writers cannot silently collide. |
| `yjs_snapshots` | `{_id: documentId, state (binary), upToSeq, updatedAt}` | One compacted state per document, covering every update up to `upToSeq`. |

Loading merges the snapshot and the updates after `upToSeq`. **Compaction** re-encodes everything through a `Y.Doc` (which drops the content of deleted text), writes the snapshot, and only then deletes the folded updates; a crash in between leaves updates that are applied twice, which Yjs ignores. A session compacts after 100 appended updates, counting those it found on load. The rendered text is never stored as the source of truth.

A session writes in batches: updates are merged and appended after 1 s without edits, or at the latest 5 s after the first unsaved one. A failed write stays buffered, is reported and retried with a doubling delay (2 s up to 30 s); a session whose last write failed is kept in memory and evicted when a retry succeeds. The last connection leaving and graceful shutdown force a flush.

### Where content lives

After a document is first opened, **the Yjs state in MongoDB is the only writable source of its Markdown.**

- **Seeding.** The first join of a document with no stored state seeds the `Y.Text` from the Markdown the Document service returned in the same access check, and stores the seed before using it. It is idempotent: every seed is written by the fixed client id 1, so seeding the same text twice produces identical structs and merging them yields the text once. Later joins find stored state and ignore the Document service's copy; empty documents are seeded too.
- **The Document service's `markdown` column** is therefore the initial content only. `PUT /api/documents/{id}` no longer changes it and may omit it; `POST` still requires it. No migration is needed because seeding happens lazily on first open.
- **REST reads.** `GET /documents/{id}/markdown` on the collaboration service (bearer token optional, no cookie) runs the same access check and returns the open session's text, else the stored state's text, else the seed without storing it. The Next.js `GET /api/documents/{id}` adapter replaces `markdown` in the Document service's answer with that text, so the public read-only page and every other REST reader see live content, and fails with `502` if the live text cannot be fetched rather than showing stale text.

### Awareness

Cursors and selections use the y-protocols awareness. The server never relays a client's state as sent: it rebuilds `{user: {id, name, color}, cursor}` with the authenticated id and username and a color derived from the id, and takes only the selection from the client, rebuilt field by field from the Yjs relative-position shape. No email or token can pass through. A connection controls one client id; another user cannot take it over, the same user can (a reconnect before the old connection timed out). Leaving, disconnecting, eviction and revocation remove the state for everyone.

### Sessions and cleanup

`DocumentSession` owns a `Y.Doc`, its awareness and its members; `DocumentSessionManager` loads on first join (concurrent joins share one load), evicts after the last member leaves and its buffer is stored, and destroys the document, which removes its listeners and timers. `createApp` stays the only composition root.

### Frontend

`DocumentCollaboration` owns the `Y.Doc`, awareness and undo manager and runs the socket (join, handshake, awareness, heartbeat, reconnect with the presence client's backoff). `useCollaborativeDocument` creates it in an effect and disposes it on unmount. `CollaborativeEditor` is a CodeMirror 6 Markdown editor bound to the `Y.Text` with `yCollab`; undo only reverts local changes because remote updates carry another origin. The editor is editable only after the first sync and only when the server says `canEdit`; viewers see the live preview. The existing connection status component shows the state.

## Consequences

- **One instance.** Sessions, awareness and the write buffer live in the memory of one collaboration process, and `seq` is allocated by reading the highest value, which is only safe with a single writer. A second instance would serve a different copy of the same document. Memory grows with open documents and their connections; nothing limits the number of open documents.
- **Durability window.** After a crash, edits younger than the write delay (at most about 5 s) or buffered while MongoDB was down are gone from the server, but the clients that made them still hold them and the sync handshake restores them on reconnect (tested). A user who closed their tab inside that window loses those edits.
- **Staleness.** The PostgreSQL `markdown` column and the `markdown` in document list responses are stale seed copies; nothing in the UI uses them. Anything that needs current text must use the collaboration service.
- **Coupling.** Every document read through the Next.js adapter costs a second call, and a collaboration outage makes document reads fail. Revalidation downloads each document's seed Markdown from the Document service on every sweep (the answer is the only existing way to ask for `canEdit`); a lighter endpoint would remove that.
- **Permission loss.** A user demoted while typing keeps edits made before the next `document-access` in their local copy, which the server dropped; they see the notice and read-only editor, but the unsent text is not offered back.
- **Limits.** Frames are capped at 4 MiB and the document service caps Markdown at 1,000,000 characters; the collaboration service does not cap the Yjs document size itself.
- **Tests.** Persistence contract tests run against the fake always and against MongoDB when `MONGODB_URL` is set (CI has no Mongo service). Convergence, offline merge, restart recovery and the recovery of unsaved edits run end to end over real sockets.

## Path to horizontal scale

Not built. The steps, in order: route every connection of a document to one instance (sticky routing by document id at Nginx); or let any instance serve it and relay updates and awareness between instances through Redis pub/sub (as `y-redis` does), with an atomic per-document `seq`; move the revalidation answer to Kafka membership events (ADR-005); and publish debounced `document.changed` events so the Document service can keep a derived copy for search and the AI service, as ADR-001 proposed. Hocuspocus remains the alternative if maintaining the relay becomes too expensive.
