import secrets
from collections.abc import Generator
from datetime import timedelta

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import ALGORITHM, SECRET_KEY, create_access_token
from app.database import Base, User, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db() -> Generator[Session, None, None]:
    """Supply an isolated in-memory session to auth endpoints."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db() -> Generator[None, None, None]:
    """Reset test data and restore dependency overrides after each test."""
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_signup_and_login_flow() -> None:
    """Signup persists a user whose JWT authenticates their profile."""
    signup_res = client.post(
        "/auth/signup",
        json={"email": "amber@sussex.ac.uk", "password": "securepassword123"},
    )
    assert signup_res.status_code == 201
    assert signup_res.json()["email"] == "amber@sussex.ac.uk"
    assert signup_res.json()["role"] == "user"

    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == "amber@sussex.ac.uk").one()
        assert user.role == "user"
        assert user.hashed_password != "securepassword123"

    login_res = client.post(
        "/auth/login",
        json={"email": "amber@sussex.ac.uk", "password": "securepassword123"},
    )
    assert login_res.status_code == 200
    assert login_res.json()["token_type"] == "bearer"
    token = login_res.json()["access_token"]
    claims = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert claims["sub"] == str(signup_res.json()["id"])
    assert claims["role"] == "user"
    assert "exp" in claims

    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "amber@sussex.ac.uk"


def test_duplicate_signup_fails() -> None:
    """An existing email cannot be registered again."""
    client.post(
        "/auth/signup",
        json={"email": "dup@sussex.ac.uk", "password": "password123"},
    )
    res = client.post(
        "/auth/signup",
        json={"email": "dup@sussex.ac.uk", "password": "password123"},
    )
    assert res.status_code == 400


def test_invalid_login_fails() -> None:
    """A wrong password cannot authenticate an existing account."""
    client.post(
        "/auth/signup",
        json={"email": "user@sussex.ac.uk", "password": "correctpassword"},
    )
    res = client.post(
        "/auth/login",
        json={"email": "user@sussex.ac.uk", "password": "wrongpassword"},
    )
    assert res.status_code == 401


def test_public_signup_cannot_create_admin() -> None:
    """An injected admin role never reaches the database or signed claims."""
    credentials = {"email": "attacker@sussex.ac.uk", "password": "password123"}
    res = client.post("/auth/signup", json={**credentials, "role": "admin"})
    assert res.status_code == 201
    assert res.json()["role"] == "user"
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == credentials["email"]).one()
        assert user.role == "user"
        assert db.query(User).filter(User.role == "admin").count() == 0
    token = client.post("/auth/login", json=credentials).json()["access_token"]
    assert jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])["role"] == "user"
    assert (
        client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).json()[
            "role"
        ]
        == "user"
    )


def test_unknown_user_login_fails() -> None:
    """Unknown accounts receive the same credential error as wrong passwords."""
    res = client.post(
        "/auth/login", json={"email": "unknown@sussex.ac.uk", "password": "password123"}
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Incorrect email or password"


@pytest.mark.parametrize(
    "kind",
    [
        "malformed",
        "expired",
        "wrong_key",
        "missing_exp",
        "missing_sub",
        "invalid_sub",
        "large_sub",
    ],
)
def test_invalid_tokens_are_rejected(kind: str) -> None:
    """Reject invalid signatures, expiry, and malformed identity claims."""
    token = create_access_token({"sub": "1"})
    if kind == "malformed":
        token = "not-a-jwt"
    elif kind == "expired":
        token = create_access_token({"sub": "1"}, timedelta(seconds=-1))
    elif kind == "wrong_key":
        token = jwt.encode(
            {"sub": "1", "exp": 9999999999},
            secrets.token_urlsafe(32),
            algorithm=ALGORITHM,
        )
    elif kind == "missing_exp":
        token = jwt.encode({"sub": "1"}, SECRET_KEY, algorithm=ALGORITHM)
    elif kind == "missing_sub":
        token = create_access_token({})
    elif kind == "invalid_sub":
        token = create_access_token({"sub": "not-an-integer"})
    elif kind == "large_sub":
        token = create_access_token({"sub": str(2**64)})
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


def test_me_requires_token() -> None:
    """An unauthenticated profile request is rejected."""
    assert client.get("/auth/me").status_code == 401


@pytest.mark.parametrize(
    ("path", "method"),
    [("/auth/signup", "POST"), ("/auth/login", "POST"), ("/auth/me", "GET")],
)
def test_local_frontend_cors(path: str, method: str) -> None:
    """Allow the local frontend's JSON and bearer-token preflight requests."""
    res = client.options(
        path,
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type,authorization",
        },
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_unconfigured_cors_origin_is_rejected() -> None:
    """Do not allow arbitrary sites to access authentication responses."""
    res = client.options(
        "/auth/login",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert res.status_code == 400
    assert "access-control-allow-origin" not in res.headers


@pytest.mark.parametrize("password", ["", "short", "x" * 129])
def test_signup_password_validation_never_echoes_credentials(password: str) -> None:
    response = client.post(
        "/auth/signup", json={"email": "safe@example.com", "password": password}
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "Invalid email or password length"}
    assert "input" not in response.text
