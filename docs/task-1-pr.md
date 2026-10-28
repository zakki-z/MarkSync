# PR draft

## Title

feat: complete secure Task 1 walking skeleton

## Description

Users can now register, log in, and work on private Markdown documents through Nginx with an HttpOnly browser session, server-side page protection, and independent backend ownership checks. The responsive authentication screen redirects into the workspace, supports logout, and displays safe validation/error feedback. The existing CRUD and Markdown renderer are preserved.

Bun now provides authenticated native WebSocket rooms with typed messages, per-user presence and active-session counts, heartbeat handling, authorization rechecks, and disconnect cleanup. Two browser sessions of the same owner share a roster; other accounts cannot join private documents. No concurrent editing or sharing is added.

Flyway creates or adopts the document schema non-destructively, while Hibernate validates it. CI adds the missing frontend checks, Python formatting, collaboration tests, and Compose integration/persistence verification. README and ADR scope notes describe the implemented system and preserve the AI appendices.

## Verification completed locally

| Check | Result |
| --- | --- |
| Frontend ESLint | Pass, no warnings |
| `bun run typecheck` | Pass |
| Frontend and Collaboration `bun run format:check` | Pass |
| Frontend `bun run build` | Pass |
| Frontend `bun run test:e2e` | 14 passed |
| Auth Ruff lint and format | Pass |
| Auth mypy | Pass |
| Auth pytest | 25 passed |
| Document `./mvnw -B -ntp verify` under Java 21 | 16 passed |
| Existing Workspace Maven verification | 1 passed; no Workspace source changes |
| Collaboration TypeScript and `bun test` | 11 passed |
| Compose build/start, configuration validation | Pass using the local alternate gateway port |
| Full-stack Playwright through Nginx | 2 passed |
| `scripts/verify-persistence.py` | Account and Markdown survived PostgreSQL/Auth/Document restarts |
| PostgreSQL Flyway history | V1 applied successfully |
| Desktop/mobile visual inspection | Authentication and workspace reviewed; 390px workspace has no horizontal page overflow |
| `git diff --check` | Pass |

Java verification ran in the Maven/Temurin 21 container because the host does not have Java installed. Local integration used `http://127.0.0.1:18080`: an unrelated SourceIQ container owns host port 8080. Compose retains 8080 as the default. Hosted GitHub Actions and CodeRabbit have not run for these changes; no review approval is claimed.

## Scope and limitations

- The user confirmed private documents with active-session counts. Two distinct accounts sharing a document is outside Task 1.
- Access tokens last one hour. Logout clears the browser session; there is no server revocation list. An already-open socket in another tab can remain valid until its token expires or it disconnects.
- Presence is process-local, with a manual reconnect control after failures. Content remains last-save-wins; there is no live character synchronization.
- The existing safe Markdown subset is retained, rather than claiming complete CommonMark support.
- Bun 1.3.14 can leave its shutdown promise pending after a server-initiated close. The service invokes immediate shutdown without awaiting that promise; tests verify real socket closure and refusal of new connections.
- FastAPI's existing test-client dependency emits a Starlette deprecation warning about httpx; all tests pass.
- Formatting existing frontend files accounts for part of the diff. No lint rules or tests were disabled.

## Suggested commit sequence

1. `fix(auth): secure browser sessions and protect the document workspace`
2. `fix(documents): manage persistent schema with Flyway`
3. `feat(collaboration): add authenticated document presence`
4. `test(ci): verify the walking skeleton through Compose`
5. `docs: document Task 1 setup and architecture boundaries`

Changes remain uncommitted on `feat/complete-task1-mvp`; no branch was merged or PR opened.

## Files changed

- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `backend/auth-service/.dockerignore`
- `backend/auth-service/README.md`
- `backend/auth-service/app/database.py`
- `backend/auth-service/app/main.py`
- `backend/auth-service/tests/test_auth.py`
- `backend/collaboration-service/.dockerignore`
- `backend/collaboration-service/.prettierignore`
- `backend/collaboration-service/.prettierrc.json`
- `backend/collaboration-service/README.md`
- `backend/collaboration-service/bun.lock`
- `backend/collaboration-service/index.ts`
- `backend/collaboration-service/package.json`
- `backend/collaboration-service/src/auth.ts`
- `backend/collaboration-service/src/presence.ts`
- `backend/collaboration-service/src/protocol.ts`
- `backend/collaboration-service/src/server.ts`
- `backend/collaboration-service/tests/presence.test.ts`
- `backend/document-service/.dockerignore`
- `backend/document-service/src/main/java/com/example/document/config/SecurityConfig.java`
- `backend/document-service/src/main/resources/application.properties`
- `backend/document-service/src/main/resources/db/migration/V1__create_documents.sql`
- `backend/document-service/src/test/resources/application-test.properties`
- `compose.yaml`
- `docs/adr/ADR-001-real-time-concurrency-architecture-2.md`
- `docs/adr/ADR-002-application-stack-and-document-storage-2.md`
- `docs/task-1-pr.md`
- `frontend/.dockerignore`
- `frontend/.prettierignore`
- `frontend/.prettierrc.json`
- `frontend/README.md`
- `frontend/app/api/auth/[action]/route.ts`
- `frontend/app/api/documents/[id]/route.ts`
- `frontend/app/api/documents/route.ts`
- `frontend/app/auth/page.tsx`
- `frontend/app/documents/page.tsx`
- `frontend/app/globals.css`
- `frontend/app/layout.tsx`
- `frontend/bun.lock`
- `frontend/env.sample`
- `frontend/eslint.config.mjs`
- `frontend/next.config.ts`
- `frontend/package.json`
- `frontend/playwright.config.ts`
- `frontend/playwright.integration.config.ts`
- `frontend/proxy.ts`
- `frontend/src/MarkdownPreview.tsx`
- `frontend/src/authService.tsx`
- `frontend/src/components/OnlineUsers.tsx`
- `frontend/src/components/ui.tsx`
- `frontend/src/documentService.ts`
- `frontend/src/presence.ts`
- `frontend/src/server/documentsProxy.ts`
- `frontend/src/server/session.ts`
- `frontend/src/server/upstream.ts`
- `frontend/src/session.ts` (removed; replaced by HttpOnly session handling)
- `frontend/tests/auth-proxy.spec.ts`
- `frontend/tests/auth.spec.ts`
- `frontend/tests/documents-proxy.spec.ts`
- `frontend/tests/documents.spec.ts`
- `frontend/tests/fixtures/upstream.mjs`
- `frontend/tests/integration/walking-skeleton.spec.ts`
- `infra/nginx/conf.d/nginx.conf`
- `infra/python/Dockerfile`
- `scripts/verify-persistence.py`
