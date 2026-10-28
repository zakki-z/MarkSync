# MarkSync

MarkSync is a university software engineering project for private Markdown documents and authenticated real-time presence. Task 1 delivers registration, login, document CRUD, a safe Markdown preview, and native WebSocket room presence. Concurrent text editing, sharing, RBAC, CRDT/Yjs, AI features, Kafka, MongoDB, and cloud deployment are outside this walking skeleton.

## Architecture

| Active component | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Authentication UI, document workspace, Markdown preview, same-origin API adapters |
| Authentication | Python 3.12, FastAPI, SQLAlchemy, Argon2, JWT | Persistent accounts and signed, one-hour HS256 access tokens |
| Documents | Java 21, Spring Boot 4, Spring Security, JPA, Flyway | Owner-scoped CRUD and saved Markdown |
| Collaboration | Bun 1.3.14, TypeScript, native WebSockets | Authenticated document rooms, deduplicated presence, heartbeat |
| Storage | PostgreSQL 17 | Separate `marksync_auth` and `marksync_documents` databases in a persistent volume |
| Gateway | Nginx, Docker Compose | One browser origin for pages, APIs, and `/ws` upgrades |

Workspace, AI, and Notification directories remain future service skeletons. They are not started by Compose. The existing Workspace Maven CI check is preserved.

Browser traffic goes through Nginx. `/auth` is a Next.js page; `/api/auth/*` is a Next.js adapter for FastAPI's internal `/auth/*` endpoints. `/api/documents/*` forwards authenticated requests to Spring. `/ws` goes directly to Bun. Container hostnames are used only between services.

The JWT is kept in a host-only, HttpOnly, SameSite=Lax cookie, never browser storage or a WebSocket URL. Next.js validates it before serving `/documents` and before proxying document requests. Spring independently verifies the signature and expiry and derives ownership from the subject, ignoring a supplied author on creation. Mutating browser requests require an allowed Origin; WebSocket upgrades require an allowed Origin and authentication. Invalid sessions are cleared. Logout clears the browser cookie; issued bearer tokens are stateless and expire after one hour, without a server revocation list.

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
| `JWT_SECRET_KEY` | Required, unique secret of at least 32 characters; shared by Auth and Documents |
| `POSTGRES_PASSWORD` | Required; generate a hex value to avoid URL-encoding issues in the database URL |
| `PORT` | Optional gateway port, default `8080` |
| `APP_ORIGINS` | Comma-separated exact browser origins; defaults to `http://127.0.0.1:8080,http://localhost:8080` |
| `COOKIE_SECURE` | Default `false` for local HTTP; set `true` when serving HTTPS |
| `AUTH_SERVICE_URL` | Internal FastAPI URL, set by Compose to `http://auth:8000` |
| `DOCUMENT_SERVICE_URL` | Internal Spring URL, set by Compose to `http://document:8082` |
| `DATABASE_URL` | Auth SQLAlchemy URL, set by Compose |
| `SPRING_DATASOURCE_*` | Document database URL/user/password, set by Compose |
| `CORS_ORIGINS` | Explicit allowed origins for direct FastAPI development; the browser normally uses the same-origin adapter |

If port 8080 is occupied, set both `PORT=18080` and `APP_ORIGINS=http://127.0.0.1:18080` in `.env`, then use that URL. For a standalone frontend, copy `frontend/env.sample` to `frontend/.env.local`, start the backend services, and run `bun install --frozen-lockfile && bun run dev` in `frontend`. Presence requires Nginx's `/ws` route; Compose is the supported integrated development environment.

Secrets and local environment files must not be committed. Use the same generated secrets across restarts. Changing the database password in `.env` does not change an already-created PostgreSQL role.

### Persistence and migrations

`postgres_data` holds both databases. `docker compose down` preserves it; `docker compose down -v` deletes it. Auth creates missing user tables without deleting existing rows. Document schema is managed by `V1__create_documents.sql`; Hibernate only validates it. Flyway baselines an existing Hibernate-managed schema at version 0, then applies the non-destructive migration and owner index. Existing incompatible schemas fail validation rather than being silently rewritten.

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
