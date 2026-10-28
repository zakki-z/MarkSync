# MarkSync Frontend — Authentication + Documents

Next.js 16 / React 19 frontend for the Task 1 walking skeleton. Built on the merged Auth Service frontend. All of its existing auth checks and Playwright tests are retained.

## Requirements

- Node.js 20.9+ and Bun 1.3.14
- FastAPI Authentication Service running at `http://localhost:8000`
- Spring Boot Document Service running at `http://localhost:8082` with CRUD at `/api/documents`

## Local setup (no Docker)

```bash
cd frontend
cp env.sample .env.local
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000/auth`, sign in (or sign up), and choose **Open document workspace**. `http://localhost:3000/` also opens the workspace, redirecting to login if there is no session.

The existing `NEXT_PUBLIC_API_URL` is the browser-facing FastAPI URL. Next.js Route Handlers for documents use the server-side `AUTH_SERVICE_URL` and `DOCUMENT_SERVICE_URL` from `.env.local`. Set these to the respective backend origins if not using the defaults. No Docker configuration is needed.

## Backend contract

The Document Service needs the routes below and a `DocumentDTO` with `id: number`, `title: string`, `markdown: string`, `authorId: string`, `createdAt: string`, `updatedAt: string`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/documents` | List documents |
| POST | `/api/documents` | Create document |
| GET | `/api/documents/{id}` | Read one |
| PUT | `/api/documents/{id}` | Update |
| DELETE | `/api/documents/{id}` | Delete |

The frontend sends `{ title, markdown }` on writes and forwards the bearer token to the Document Service. The backend verifies HS256 JWTs using the same `JWT_SECRET_KEY` as FastAPI, derives `authorId` from the numeric JWT subject, and enforces ownership for every CRUD operation. Configure the Document Service datasource using `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`. The Java backend should return the saved document with its ID and timestamps. A successful delete can return HTTP 204.

## Features

- Existing login/signup form, including its duplicate-submission prevention and no-visible-JWT behavior
- Tab-scoped login session, sign out, document search and list
- Create, edit, save, delete and preview Markdown documents
- A safe basic Markdown renderer for headings, text emphasis, links, lists, quotes and code blocks
- Warnings about unsaved changes
- Next.js API routes checking the JWT against FastAPI `/auth/me` before proxying to Spring Boot

## Verify

```bash
bun run lint
bun run build
bunx playwright install chromium
bun run test:e2e
```

The browser tests mock backend replies and run the production build on port 3100. For a real smoke test, run both backends, log in, create a document, preview and save it, reload the page, then update and delete it. Test a second account to confirm both the proxy and direct backend requests enforce ownership.

## Important limitation

`sessionStorage` is only an MVP session mechanism. The Markdown renderer is a safe basic subset, not full CommonMark. WebSocket presence is handled separately by the Collaboration Service.
