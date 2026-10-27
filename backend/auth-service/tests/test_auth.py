from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db() -> Generator[Session, None, None]:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def test_signup_and_login_flow() -> None:
    signup_res = client.post(
        "/auth/signup",
        json={"email": "amber@sussex.ac.uk", "password": "securepassword123", "role": "admin"},
    )
    assert signup_res.status_code == 201
    assert signup_res.json()["email"] == "amber@sussex.ac.uk"
    assert signup_res.json()["role"] == "admin"

    login_res = client.post(
        "/auth/login",
        json={"email": "amber@sussex.ac.uk", "password": "securepassword123"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "amber@sussex.ac.uk"


def test_duplicate_signup_fails() -> None:
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
    client.post(
        "/auth/signup",
        json={"email": "user@sussex.ac.uk", "password": "correctpassword"},
    )
    res = client.post(
        "/auth/login",
        json={"email": "user@sussex.ac.uk", "password": "wrongpassword"},
    )
    assert res.status_code == 401
