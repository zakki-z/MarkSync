# MarkSync

MarkSync is a university software engineering project for private Markdown documents and authenticated real-time presence. Task 1 delivers registration, login, document CRUD, a safe Markdown preview, and native WebSocket presence per workspace. Concurrent text editing, sharing, RBAC, CRDT/Yjs, AI features, Kafka, MongoDB, and cloud deployment are outside this walking skeleton.

## Architecture

| Active component | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Authentication UI, document workspace, Markdown preview, same-origin API adapters |
| Authentication | Python 3.12, FastAPI, SQLAlchemy, Argon2, JWT | Persistent accounts with usernames, authenticated user lookup, and signed, one-hour HS256 access tokens |
| Documents | Java 21, Spring Boot 4, Spring Security, JPA, Flyway | Workspace-scoped CRUD, visibility, role-based access and saved Markdown |
| Workspaces | Java 21, Spring Boot 4, Spring Security, JPA, Flyway | Workspaces, memberships with Owner/Editor/Viewer roles, and invitations (send, accept, decline, revoke) |
| Collaboration | Bun 1.3.14, TypeScript, native WebSockets | Authenticated workspace rooms, who is online, messages, heartbeat, revalidation of access |
| Storage | PostgreSQL 17 | Separate `marksync_auth`, `marksync_documents` and `marksync_workspaces` databases in a persistent volume |
| Gateway | Nginx, Docker Compose | One browser origin for pages, APIs, and `/ws` upgrades |

AI and Notification directories remain future service skeletons and are not started by Compose. The Workspace service is started by Compose (internal port 8083, not routed through Nginx yet) and its Maven CI check is preserved.

Browser traffic goes through Nginx. `/auth` is a Next.js page; `/api/auth/*` is a Next.js adapter for FastAPI's internal `/auth/*` endpoints. `/api/documents/*` and `/api/workspaces/*/documents` forward requests to the Document Service; only `GET /api/documents/{id}` is open to anonymous visitors. `/ws` goes directly to Bun. Container hostnames are used only between services.

The JWT is kept in a host-only, HttpOnly, SameSite=Lax cookie, never browser storage or a WebSocket URL. Next.js validates it before serving `/documents` and before proxying document requests. Spring independently verifies the signature and expiry, derives the caller from the subject and ignores a supplied author on creation; the Document Service then asks the Workspace Service for the caller's role (see below). Mutating browser requests require an allowed Origin; WebSocket upgrades require an allowed Origin and authentication. Invalid sessions are cleared. Logout clears the browser cookie; issued bearer tokens are stateless and expire after one hour, without a server revocation list.

## Local setup

Prerequisites: Docker Engine/Desktop with Compose v2. For tests outside containers: Bun **1.3.14**, Node.js 20.9+ (Node 24 works), Python **3.12** with `uv`, and Java **21**. Maven is supplied by the repository wrapper.

From the repository root:

```sh
cp .env.example .env
openssl rand -hex 32 # copy into JWT_SECRET_KEY in .env
openssl rand -hex 24 # copy into POSTGRES_PASSWORD in .env
docker compose up --build
```

Open **http://127.0.0.1:8080** after the services finish starting. The initial build downloads dependencies and can take several minutes. `docker compose ps` and `docker compose logs --tail=50` show startup progress. Only Nginx publishes a host port.

| Variable | Configuration |
| --- | --- |
| `JWT_SECRET_KEY` | Required, unique secret of at least 32 characters; shared by Auth, Documents and Workspaces |
| `POSTGRES_PASSWORD` | Required; generate a hex value to avoid URL-encoding issues in the database URL |
| `PORT` | Optional gateway port, default `8080` |
| `APP_ORIGINS` | Comma-separated exact browser origins; defaults to `http://127.0.0.1:8080,http://localhost:8080` |
| `COOKIE_SECURE` | Default `false` for local HTTP; set `true` when serving HTTPS |
| `AUTH_SERVICE_URL` | Internal FastAPI URL used by the frontend and the Workspace Service (user lookup), set by Compose to `http://auth:8000` |
| `INVITATION_TTL` | Optional, Workspace Service: how long an invitation can be accepted, default `7d` |
| `WORKSPACE_SERVICE_URL` | Internal Workspace Service URL used by the Document Service, the Collaboration service and the frontend, set by Compose to `http://workspace:8083` |
| `DOCUMENT_SERVICE_URL` | Internal Spring URL, set by Compose to `http://document:8082` (used by the frontend) |
| `REVALIDATE_INTERVAL_MS` | Optional, Collaboration service: how often joined workspaces are checked against the Workspace Service, default `10000` in Compose and `30000` without it |
| `WORKSPACE_SERVICE_URL` | Internal Spring URL, set by Compose to `http://workspace:8083` |
| `DATABASE_URL` | Auth SQLAlchemy URL, set by Compose |
| `SPRING_DATASOURCE_*` | Document and Workspace database URL/user/password, set by Compose |
| `CORS_ORIGINS` | Explicit allowed origins for direct FastAPI development; the browser normally uses the same-origin adapter |

If port 8080 is occupied, set both `PORT=18080` and `APP_ORIGINS=http://127.0.0.1:18080` in `.env`, then use that URL. For a standalone frontend, copy `frontend/env.sample` to `frontend/.env.local`, start the backend services, and run `bun install --frozen-lockfile && bun run dev` in `frontend`. Presence requires Nginx's `/ws` route; Compose is the supported integrated development environment.

Secrets and local environment files must not be committed. Use the same generated secrets across restarts. Changing the database password in `.env` does not change an already-created PostgreSQL role.

### Workspace documents and visibility

Every document belongs to a workspace and has a `visibility` of `PRIVATE` (default) or `PUBLIC`. All access rules live in one place, `DocumentAccessPolicy` in the Document Service, so other services can reuse them:

| Who | Read | Edit / delete / create |
| --- | --- | --- |
| Workspace `OWNER` or `EDITOR` | yes | yes |
| Workspace `VIEWER` | yes | no |
| Authenticated non-member | only `PUBLIC` documents | no |
| Anonymous visitor | only `PUBLIC` documents | no |

| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/workspaces/{id}/documents` | member with edit rights | Server assigns the author and workspace. |
| `GET /api/workspaces/{id}/documents` | any member | Lists the workspace's documents. |
| `GET /api/documents/{id}` | optional | Anonymous callers get `PUBLIC` documents only. |
| `PUT` / `DELETE /api/documents/{id}` | member with edit rights | A document cannot move between workspaces. |

Denied requests return `401` for anonymous callers and `403` for authenticated ones; unknown documents return `404`. Document responses include `workspaceId`, `visibility` and `canEdit`; the UI shows a read-only view whenever `canEdit` is false and does not re-implement the rules. The Workspace Service adds `GET /api/workspaces/{id}/membership` (the caller's role and what it allows, or `404` for non-members), which the Document Service calls with a short-lived token signed with the shared `JWT_SECRET_KEY`. Pages: `/w/{workspaceId}` (dashboard and workspace switcher) and `/w/{workspaceId}/d/{documentId}` (open to anonymous visitors for public documents). See [ADR-003](docs/adr/ADR-003-workspace-document-authorization.md).

### Invitations and members

Each member has one role per workspace, and the capabilities live in the `WorkspaceRole` enum (the only place they are defined). The membership endpoint returns them, so clients show or hide actions from the response instead of repeating the rules.

| Role | Edit documents | Manage members and invitations | Rename, delete, change visibility |
| --- | --- | --- | --- |
| `OWNER` | yes | yes | yes |
| `EDITOR` | yes | no | no |
| `VIEWER` | no | no | no |

A workspace always has at least one owner. Invitations can grant `EDITOR` or `VIEWER`; owners promote members with a role change. An invitation goes from `PENDING` to exactly one of `ACCEPTED`, `DECLINED` or `REVOKED`, and any other transition fails with `409`. Invitations expire after `INVITATION_TTL` (default 7 days) and then cannot be accepted. There are no emails or notifications: invitations appear in the app under **Invitations**, with a pending count in the sidebar.

| Endpoint (Workspace Service) | Who | Notes |
| --- | --- | --- |
| `POST /api/workspaces/{id}/invitations` | owner | Body `{identifier, role}`, where the identifier is a username or email. `404` for an unknown user, `409` for an existing member or a pending invitation. |
| `GET /api/workspaces/{id}/invitations` | owner | Pending, unexpired invitations. |
| `DELETE /api/workspaces/{id}/invitations/{invitationId}` | owner | Revokes a pending invitation. |
| `GET /api/invitations` | any user | The caller's own pending invitations. |
| `POST /api/invitations/{id}/accept`, `/decline` | the invited user | Accepting creates the membership in the same transaction. Anyone else gets `404`. |
| `GET /api/workspaces/{id}/members` | any member | Members with usernames. |
| `PATCH /api/workspaces/{id}/members/{userId}` | owner | Body `{role}`. The last owner cannot be demoted (`409`). |
| `DELETE /api/workspaces/{id}/members/{userId}` | owner | The last owner cannot be removed (`409`). |
| `DELETE /api/workspaces/{id}/membership` | any member | Leave the workspace; the last owner cannot (`409`). |

The Workspace Service stores only user ids (and the email the inviter typed, for display). It finds users and resolves usernames through the Auth service's authenticated `GET /auth/users/lookup?q=` and `GET /auth/users?ids=`, which return only `id` and `username`. Pages: `/w/{workspaceId}/members` and `/invitations`. See [ADR-004](docs/adr/ADR-004-invitations-and-membership.md).

To try it with two accounts: sign up as `olivia` and `dana` (Sign up has an optional username), as Olivia open a workspace, go to **Members** and invite `dana` as Editor, then as Dana open **Invitations** and accept. Dana now edits Olivia's documents; invite a third account as Viewer to see them read-only.

### Workspace presence and messages

Members of a workspace see who else is online and can send short messages to them, over one authenticated WebSocket per browser tab (`/ws`, Nginx to Bun). The dashboard (`/w/{id}`) and the document view show an **Online Users** list (names, a "you" marker and the count), a connection indicator (**Connected**, **Reconnecting**, **Disconnected**, **Access revoked**) and a small message box. The UI only shows what the server reports; membership is decided by the Workspace Service.

| Rule | Behaviour |
| --- | --- |
| Handshake | Allowed Origin and the `marksync_session` cookie, verified with the Auth service, before the upgrade. Otherwise `401`/`403`, or `503` if Auth is down. |
| Join | Any role (owner, editor, viewer) may join. Every join asks `GET /api/workspaces/{id}/membership`; non-members get an error and are not added. An unavailable Workspace Service refuses the join. |
| Messages | Delivered only to the room's members, and only if the sender has joined that room. |
| Tabs | A user with several tabs is online until the last one leaves. |
| Privacy | Other members see only user id and display name (the username), never emails or tokens. |
| Heartbeat | The client sends one every 15 s; the server drops a connection silent for more than 3 intervals and updates presence. |
| Revoked access | Every `REVALIDATE_INTERVAL_MS` the server re-checks each joined workspace. A removed member is taken out of the room, told, and disconnected with `4403`; the others see them leave. |
| Reconnect | The frontend reconnects with exponential backoff and jitter (1 s up to 30 s) and joins again, except after `4401` (sign in again) or `4403` (no access). |

Close codes: `4401` unauthenticated, `4403` forbidden or access revoked, `4408` heartbeat timeout, `1012` server restarting, `1013` try again later (Workspace Service unavailable). The message protocol and design are in [ADR-005](docs/adr/ADR-005-workspace-presence.md) and the Collaboration service README. State is in memory in one instance; see the ADR for the limits.

### Persistence and migrations

`postgres_data` holds both databases. `docker compose down` preserves it; `docker compose down -v` deletes it. Auth creates missing user tables without deleting existing rows; on startup it also adds and backfills the `users.username` column (from the email's local part) if an older database lacks it. Document schema is managed by `V1__create_documents.sql`; Hibernate only validates it. Flyway baselines an existing Hibernate-managed schema at version 0, then applies the non-destructive migration and owner index. Existing incompatible schemas fail validation rather than being silently rewritten.

MS-02 adds `workspace_id` in three steps: `V2` adds the nullable column, the Java migration `V3__BackfillDocumentWorkspaces` moves every existing document into its author's "Personal" workspace (found or created through the Workspace Service, so it is safe to retry), and `V4` makes the column `NOT NULL` and indexes it. `V5` adds `visibility`. The Document Service therefore needs the Workspace Service reachable (`WORKSPACE_SERVICE_URL`) when it starts against a database that still has documents without a workspace; Compose restarts it on failure until the Workspace Service is up.

The Workspace schema is managed by `V1__create_workspace_schema.sql` (tables `workspaces`, `workspace_members`, `workspace_invitations`) and `V2__invitations_by_user.sql`, which guarantees every workspace owner an `OWNER` membership and replaces the unused email-token invitations table with one that targets a user id; Hibernate only validates it. `infra/postgres/init.sql` creates `marksync_workspaces` only when the PostgreSQL volume is first initialised. If you already have a `postgres_data` volume, either run `docker compose down -v` (deletes all data) or create it once by hand:

```sh
docker compose exec postgres psql -U marksync -d postgres -c "CREATE DATABASE marksync_workspaces;"
docker compose up -d workspace
```

User ids are stored as plain strings with no foreign keys, because users live in the separate Auth database. "One pending invitation per workspace and user" is enforced by the database: `pending_marker` is `TRUE` only while an invitation is `PENDING` and `NULL` afterwards, and a unique constraint over (workspace, user, marker) allows any number of closed invitations but one open one (a partial index would not run on the H2 test database).

## Demonstrating Task 1 and workspace presence

1. Open `/auth`, select **Sign up**, register an email with an 8–128 character password, then log in. You arrive at your personal workspace.
2. Create a document, edit and save it. Reload to confirm it reopens, then choose **Preview**.
3. Open a separate browser profile or private window and log in as the **same user**. Both windows list that user once under **Online Users**; closing one window leaves the user online.
4. In the separate window, sign out and sign up a second account. As the owner, open **Invitations** in the workspace, invite the second account by email or username, and accept it as that account under **My invitations**.
5. Open the workspace in both browsers. Each lists both users, with the "you" marker on their own name. Send a message in each browser: it appears in both.
6. Network failure: stop the second browser's network (for example DevTools **Offline**). Its status shows **Reconnecting**, and the first browser stops listing it (at once if the socket closes, otherwise after the 45 s heartbeat timeout). Restore the network: it reconnects and joins again by itself.
7. Revoked access: as the owner open **Members** and remove the second account while it is connected. Within `REVALIDATE_INTERVAL_MS` its status changes to **Access revoked** and it stops receiving messages; the first browser stops listing it.
8. Sign in with an account that is not a member: private documents are absent and joining the workspace over `/ws` is refused.
9. Sign out and revisit `/documents`: you return to `/auth`; protected API requests return 401.

The preview supports headings, paragraphs, emphasis, lists, quotes, links, and fenced code. Raw HTML is escaped and unsafe link schemes are not rendered. It is a small Markdown subset, not a complete CommonMark implementation. Presence does not synchronize edits; saving from two sessions uses the existing last-save-wins behavior.

## Automated checks

Frontend (isolated upstream fixtures; production Next build):

```sh
cd frontend
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run format:check
bun run build
bun x playwright install --with-deps chromium
bun run test:e2e
```

Authentication:

```sh
cd backend/auth-service
uv sync --locked --group dev --python 3.12
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest
```

Documents (Java 21; H2 runs the real Flyway migration for isolated tests):

```sh
cd backend/document-service
./mvnw -B verify
```

Workspaces (Java 21; H2 runs the real Flyway migrations and checks the schema constraints; the Auth service is replaced by an in-memory fake):

```sh
cd backend/workspace-service
./mvnw -B verify
```

Collaboration (real local Bun WebSocket connections against stubbed Auth and Workspace services):

```sh
cd backend/collaboration-service
bun install --frozen-lockfile
bun run typecheck
bun run format:check
bun test
```

Full integration, with Compose running, from the repository root:

```sh
python3 scripts/verify-persistence.py
cd frontend
bun x playwright test --config playwright.integration.config.ts
```

The persistence check creates an isolated account/document, restarts PostgreSQL, Auth, and Documents, logs in again, and checks the saved content. It briefly interrupts this local stack and leaves its test record for inspection. Set `E2E_BASE_URL` for an alternate gateway URL. Playwright checks actual signup/login, private CRUD, safe preview, two browser contexts, WebSocket denial for another account, two accounts seeing each other online and exchanging messages, a removed member being cut off, CSRF protection, invalid cookies, mobile authentication, and logout. The reconnect logic is unit-tested in `frontend/tests/presence-client.spec.ts`.

## CI and review

`.github/workflows/ci.yml` runs on PRs and main pushes: frontend ESLint, TypeScript, Prettier, build and Playwright; Auth Ruff lint/format, mypy and pytest; Maven verification; Collaboration TypeScript, formatting and Bun tests; and an isolated Compose integration job including PostgreSQL restarts. Lockfiles are enforced. No public cloud deployment is required. Failed integration runs upload Playwright traces; treat traces as sensitive test artifacts because they can include session data.

There is no repository CodeRabbit configuration. An installed GitHub CodeRabbit integration can review the PR using its configured defaults. No CodeRabbit approval is assumed; actual feedback must be addressed after opening the PR. See [the PR draft](docs/task-1-pr.md) for scope and verification results.

Architecture context is recorded in [ADR-001](docs/adr/ADR-001-real-time-concurrency-architecture-2.md) and [ADR-002](docs/adr/ADR-002-application-stack-and-document-storage-2.md). Their future concurrency decisions do not add those technologies to Task 1.
