# ADR-003: Workspace Document Authorization Across Services

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** [ADR-002: Application Stack and Document Storage](ADR-002-application-stack-and-document-storage-2.md)

## Context

MS-02 moves documents into workspaces and adds role-based and public access. Documents live in the Document Service's database (`marksync_documents`) and workspaces and memberships in the Workspace Service's (`marksync_workspaces`). A foreign key from `documents.workspace_id` to `workspaces`, a single SQL backfill that creates missing workspaces, and a join on memberships are therefore impossible.

## Decision

- `documents.workspace_id` is a plain indexed `BIGINT` without a foreign key, like `author_id`. Referential integrity is the services' contract, not the database's.
- The Document Service asks the Workspace Service for the caller's role (`GET /api/workspaces/{id}/membership`) through the `WorkspaceClient` port. The call carries a one-minute token signed with the shared `JWT_SECRET_KEY` and the user's id as subject, so no new credential or trust path is introduced.
- All rules live in one interface, `DocumentAccessPolicy` (`canRead`, `canEdit`, plus workspace-level `canListIn` and `canCreateIn`), implemented by `WorkspaceDocumentAccessPolicy`. Services depend on the interface; later collaboration services can reuse it. A null user id means an anonymous visitor.
- Denials throw Spring Security's `AccessDeniedException`, which the filter chain turns into `401` (anonymous) or `403` (authenticated).
- Existing documents are backfilled by a Flyway Java migration that finds or creates a "Personal" workspace per author through the Workspace Service. It is idempotent and fails the start-up, leaving data untouched, if the Workspace Service is unreachable.
- Visibility is the enum `DocumentVisibility` (`PRIVATE`, `PUBLIC`) so further levels can be added without a schema change.

## Consequences

- Reading or editing a private document costs one or two internal HTTP calls to the Workspace Service, and its outage makes private documents unavailable (`503`). Public documents read by anonymous visitors need no call. Caching roles is a possible later optimization.
- The Document Service must be able to reach the Workspace Service when it migrates a database that still has documents without a workspace.
- A workspace deleted in the Workspace Service leaves its documents orphaned and inaccessible; cleanup belongs to a later ticket.
