# Authentication Service

FastAPI authentication with SQLAlchemy persistence, Argon2 password hashing, and JWT bearer tokens. Public signup always creates a `user`; the database retains its role field for future authorization features.

## Run locally

From `backend/auth-service`, with Python 3.12+ and uv installed:

```bash
uv sync --locked --group dev
cp env.sample .env
openssl rand -hex 32
```

Set `JWT_SECRET_KEY` in the ignored `.env` file to the generated value (at least 32 characters). There is no default signing key: missing or short keys stop startup with a configuration error. Use a unique private key per environment. Rotate any previously used published key; existing tokens signed with it must no longer be trusted. Never commit `.env` or signing keys.

`DATABASE_URL` in the sample preserves the native PostgreSQL configuration at `localhost:5432/marksync_auth`; use the credentials for your existing local database. For native development without PostgreSQL, SQLAlchemy also supports `DATABASE_URL=sqlite:///./test.db`, which persists users in a local file. Keep that file between restarts.

`CORS_ORIGINS` is a comma-separated list of explicitly permitted frontend origins, defaulting to `http://localhost:3000`. Wildcard origins are rejected.

Start the service, loading `.env` before application imports:

```bash
uv run uvicorn app.main:app --reload --env-file .env --host 127.0.0.1 --port 8000
```

Open <http://localhost:8000/docs> for the API. The frontend runs separately at <http://localhost:3000/auth>; see [frontend setup](../../frontend/README.md).

## API endpoints

- `GET /health`: health check.
- `POST /auth/signup`: register with `email` and an 8–128 character `password`. Additional role input cannot grant administrator privileges.
- `POST /auth/login`: submit JSON `email` and `password` to receive an access token.
- `GET /auth/me`: retrieve the stored profile with `Authorization: Bearer <token>`.

## Checks

```bash
uv run ruff check .
uv run ruff format --check .
uv run mypy .
uv run pytest
```

Tests configure an isolated in-memory SQLite database and a newly generated test signing key before importing the application. They require no `.env`, PostgreSQL server, or shared secrets, and never access the development database.

Through Nginx, the browser calls the Next.js `/api/auth/*` adapter. It stores the token in an HttpOnly cookie and enforces Origin checks; it never returns the access token to browser JavaScript. FastAPI validation responses omit input values so credentials cannot be echoed in errors.
