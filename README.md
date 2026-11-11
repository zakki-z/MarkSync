# MarkSync

MarkSync is a university software engineering project for private Markdown documents and authenticated real-time presence. Task 1 delivers registration, login, document CRUD, a safe Markdown preview, and native WebSocket room presence. Concurrent text editing, sharing, RBAC, CRDT/Yjs, AI features, Kafka, MongoDB, and cloud deployment are outside this walking skeleton.

## Architecture

| Active component | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Authentication UI, document workspace, Markdown preview, same-origin API adapters |
| Authentication | Python 3.12, FastAPI, SQLAlchemy, Argon2, JWT | Persistent accounts and signed, one-hour HS256 access tokens |
| Documents | Java 21, Spring Boot 4, Spring Security, JPA, Flyway | Workspace-scoped CRUD, visibility, role-based access and saved Markdown |
| Workspaces | Java 21, Spring Boot 4, Spring Security, JPA, Flyway | Foundation only: schema for workspaces, memberships and invitations, plus JWT-protected service shell; no workspace endpoints yet |
| Collaboration | Bun 1.3.14, TypeScript, native WebSockets | Authenticated document rooms, deduplicated presence, heartbeat |
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
| `AUTH_SERVICE_URL` | Internal FastAPI URL, set by Compose to `http://auth:8000` |
| `WORKSPACE_SERVICE_URL` | Internal Workspace Service URL used by the Document Service and the frontend, set by Compose to `http://workspace:8083` |
| `DOCUMENT_SERVICE_URL` | Internal Spring URL, set by Compose to `http://document:8082` |
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

Denied requests return `401` for anonymous callers and `403` for authenticated ones; unknown documents return `404`. Document responses include `workspaceId`, `visibility` and `canEdit`; the UI shows a read-only view whenever `canEdit` is false and does not re-implement the rules. The Workspace Service adds `GET /api/workspaces/{id}/membership` (the caller's role, or `404` for non-members), which the Document Service calls with a short-lived token signed with the shared `JWT_SECRET_KEY`. Pages: `/w/{workspaceId}` (dashboard and workspace switcher) and `/w/{workspaceId}/d/{documentId}` (open to anonymous visitors for public documents). See [ADR-003](docs/adr/ADR-003-workspace-document-authorization.md).

### Persistence and migrations

`postgres_data` holds both databases. `docker compose down` preserves it; `docker compose down -v` deletes it. Auth creates missing user tables without deleting existing rows. Document schema is managed by `V1__create_documents.sql`; Hibernate only validates it. Flyway baselines an existing Hibernate-managed schema at version 0, then applies the non-destructive migration and owner index. Existing incompatible schemas fail validation rather than being silently rewritten.

MS-02 adds `workspace_id` in three steps: `V2` adds the nullable column, the Java migration `V3__BackfillDocumentWorkspaces` moves every existing document into its author's "Personal" workspace (found or created through the Workspace Service, so it is safe to retry), and `V4` makes the column `NOT NULL` and indexes it. `V5` adds `visibility`. The Document Service therefore needs the Workspace Service reachable (`WORKSPACE_SERVICE_URL`) when it starts against a database that still has documents without a workspace; Compose restarts it on failure until the Workspace Service is up.

The Workspace schema is managed by `V1__create_workspace_schema.sql` (tables `workspaces`, `workspace_members`, `workspace_invitations`); Hibernate only validates it. `infra/postgres/init.sql` creates `marksync_workspaces` only when the PostgreSQL volume is first initialised. If you already have a `postgres_data` volume, either run `docker compose down -v` (deletes all data) or create it once by hand:

```sh
docker compose exec postgres psql -U marksync -d postgres -c "CREATE DATABASE marksync_workspaces;"
docker compose up -d workspace
```

User ids are stored as plain strings with no foreign keys, because users live in the separate Auth database. The "one pending invitation per workspace and email" rule is enforced by the service layer, not the database.

## Demonstrating Task 1

1. Open `/auth`, select **Sign up**, register an email with an 8–128 character password, then log in. You arrive at `/documents`.
2. Enter a title and Markdown, create the document, edit and save it. Reload to confirm it reopens, then choose **Preview**.
3. Open a separate browser profile/private window and log in as the **same owner**. Open the saved document. Both windows show **1 online user / 2 active sessions**.
4. Close the second window, switch it to a new document, or sign out. The first window returns to **1 active session**.
5. Sign in with a different account: the private document is absent, and direct API or room access is denied.
6. Sign out and revisit `/documents`: you return to `/auth`; protected API requests return 401.

Owner-only documents and deduplication mean two different users cannot join the same private document. Task 1 therefore demonstrates two authenticated sessions of the owner with a session count. The generic presence tests also exercise two distinct identities with an injected authorization policy; production uses the Document Service's owner-only policy. Sharing must be specified separately before a two-account demo is possible.

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

Workspaces (Java 21; H2 runs the real Flyway migration and checks the schema constraints):

```sh
cd backend/workspace-service
./mvnw -B verify
```

Collaboration (real local Bun WebSocket connections, isolated auth/authorization fixtures):

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

The persistence check creates an isolated account/document, restarts PostgreSQL, Auth, and Documents, logs in again, and checks the saved content. It briefly interrupts this local stack and leaves its test record for inspection. Set `E2E_BASE_URL` for an alternate gateway URL. Playwright checks actual signup/login, private CRUD, safe preview, two browser contexts, WebSocket denial for another account, disconnects, CSRF protection, invalid cookies, mobile authentication, and logout.

## CI and review

`.github/workflows/ci.yml` runs on PRs and main pushes: frontend ESLint, TypeScript, Prettier, build and Playwright; Auth Ruff lint/format, mypy and pytest; Maven verification; Collaboration TypeScript, formatting and Bun tests; and an isolated Compose integration job including PostgreSQL restarts. Lockfiles are enforced. No public cloud deployment is required. Failed integration runs upload Playwright traces; treat traces as sensitive test artifacts because they can include session data.

There is no repository CodeRabbit configuration. An installed GitHub CodeRabbit integration can review the PR using its configured defaults. No CodeRabbit approval is assumed; actual feedback must be addressed after opening the PR. See [the PR draft](docs/task-1-pr.md) for scope and verification results.

Architecture context is recorded in [ADR-001](docs/adr/ADR-001-real-time-concurrency-architecture-2.md) and [ADR-002](docs/adr/ADR-002-application-stack-and-document-storage-2.md). Their future concurrency decisions do not add those technologies to Task 1.
