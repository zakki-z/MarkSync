# ADR-004: Invitations and Membership Across Services

- **Status:** Accepted
- **Date:** 2026-11-11
- **Related:** [ADR-003: Workspace Document Authorization Across Services](ADR-003-workspace-document-authorization.md)

## Context

MS-03 lets owners invite people to a workspace and manage their roles. Users live in the Auth service's database, workspaces, memberships and invitations in the Workspace service's, and documents in the Document service's. A foreign key, a join or a distributed transaction between them is not possible, yet an invitation must name a real user, and accepting it must change membership atomically.

## Decision

- **The Workspace service owns invitations and memberships; the Auth service owns users.** Invitations store `invited_user_id` (a plain string, no foreign key) and, for display only, the email the inviter typed. No profile is copied.
- **User lookup is a read-only, authenticated Auth endpoint** (`GET /auth/users/lookup?q=`, plus a batch `GET /auth/users?ids=` to show names). Both return only `id` and `username`: no email, no partial matches. Anonymous callers get `401` whatever they ask, so they learn nothing about which accounts exist. The Workspace service reaches it through the `UserDirectoryClient` port, with a one-minute token signed with the shared `JWT_SECRET_KEY`, the same arrangement as the Document service's `WorkspaceClient`. An Auth outage makes inviting and listing names fail with `503`; membership and documents keep working because they never call Auth.
- **Consistency needs no cross-service transaction.** The user is resolved once, when the invitation is sent. Accepting touches only Workspace-service tables: the status change and the new membership are one local transaction. If the user's account is later deleted, the stored id simply stops resolving to a username.
- **The invitation is a small state machine inside the entity.** `PENDING` is the only open state; `accept`, `decline` and `revoke` each leave it exactly once and every other transition throws. Who may trigger a transition is a service-layer rule: only the invited user accepts or declines (anyone else gets `404`, so invitation ids reveal nothing), only an owner revokes. Expiry is not a status: it is derived from `expires_at`, so nothing has to run in the background. Expired invitations disappear from lists, cannot be accepted, and are closed automatically when a new invitation is sent to the same user.
- **One open invitation per user and workspace is a database rule.** A nullable `pending_marker` is `TRUE` while an invitation is `PENDING` and `NULL` afterwards, under a unique constraint with the workspace and user. NULLs are distinct, so closed invitations pile up freely. A partial unique index would say the same but H2, which the tests use to run the real migrations, does not support it.
- **Role capabilities are defined once.** `WorkspaceRole` carries `canEdit`, `canManageMembers` and `canManageWorkspace`. `WorkspaceMemberPolicy` applies them for member management, and the membership endpoint returns them. The Document service reads `canEdit` from that response instead of keeping its own copy of the role enum, and the frontend shows or hides actions from the same flags.
- **The last-owner rule is enforced under a lock.** Changing a role, removing a member and leaving all lock the workspace row (`SELECT ... FOR UPDATE`) before counting owners, so two owners cannot demote each other concurrently and leave none. A unique-constraint race elsewhere (for example a double accept) surfaces as `409` instead of `500`.
- **Invitations cannot grant ownership**; owners promote existing members with a role change. This keeps the V1 database rule that an invitation role is `EDITOR` or `VIEWER`.
- **Non-members see "not found".** Member and invitation endpoints answer `404` to non-members and `403` to members who lack the capability, matching the existing workspace behaviour.

## Consequences

- Usernames are now a unique part of the account. Existing accounts are given one derived from the email's local part when the Auth service first starts (`upgrade_schema`), since the Auth schema has no migration tool.
- An authenticated user can test whether a given username or email exists. That is inherent to inviting by email; the endpoint returns the minimum, requires a token, and has no rate limiting yet, which should be added before this is exposed publicly.
- Co-owners are real: `workspaces.owner_id` remains the creator, but rename, delete and visibility changes now follow the `OWNER` role.
- Invitations are visible in the app only. Email delivery, notifications and events are deliberately out of scope.
