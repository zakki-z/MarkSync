# Authentication Service
### Amber 27 oct 2026

This is the **Authentication Service** for the MarkSync AI project, built with **FastAPI**, **SQLAlchemy**, and **JWT (JSON Web Tokens)**.

## Features
User Signup & Login**: Secure user registration and token-based login.
Password Hashing**: Industry-standard secure password hashing using `pwdlib[argon2]`.
Role-Based Access**: Supports `user` and `admin` roles.
Database Persistence**: Integrated with PostgreSQL (and fallback SQLite for testing).
Automated Testing**: Comprehensive unit tests with `pytest`.

## API Endpoints
`GET /health` - Service health check
`POST /auth/signup` - Register a new user (`email`, `password`, `role`)
`POST /auth/login` - Authenticate and receive a JWT access token
`GET /auth/me` - Retrieve current authenticated user profile (requires Bearer Token)

## Tests
To run the automated tests locally using `uv`:
```bash
uv run pytest
```

## Docker 
Build and run the container:
```bash
docker build -t marksync-auth .
docker run -p 8000:8000 marksync-auth
```
