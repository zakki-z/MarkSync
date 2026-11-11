import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.database import (
    USERNAME_MAX,
    USERNAME_MIN,
    Base,
    User,
    derive_username,
    engine,
    get_db,
    upgrade_schema,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Create missing authentication tables on startup."""
    Base.metadata.create_all(bind=engine)
    upgrade_schema()
    yield


app = FastAPI(title="MarkSync auth Service", lifespan=lifespan)
cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
]
if "*" in cors_origins:
    raise ValueError(
        "CORS_ORIGINS must list explicit origins; wildcard access is not allowed."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(
    _request: Request, _error: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": "Invalid email, username or password length"},
    )


class UserSignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(
        default=None,
        min_length=USERNAME_MIN,
        max_length=USERNAME_MAX,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$",
    )


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    role: str
    model_config = ConfigDict(from_attributes=True)


class UserSummary(BaseModel):
    """The minimal public view of an account: no email, so lookups reveal nothing more."""

    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@app.get("/health")
def health() -> dict[str, str]:
    """Report service availability."""
    return {"status": "ok"}


@app.post(
    "/auth/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
def signup(user_in: UserSignupRequest, db: Annotated[Session, Depends(get_db)]) -> User:
    """Register an ordinary user, ignoring client-supplied role fields."""
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    if user_in.username is not None:
        username = user_in.username.lower()
        if db.query(User).filter(User.username == username).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken",
            )
    else:
        taken = set(db.scalars(select(User.username)))
        username = derive_username(user_in.email, taken)
    new_user = User(
        email=user_in.email,
        username=username,
        hashed_password=get_password_hash(user_in.password),
        role="user",
    )
    db.add(new_user)
    try:
        db.commit()
    except IntegrityError as err:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Email or username already registered"
        ) from err
    db.refresh(new_user)
    return new_user


@app.post("/auth/login", response_model=TokenResponse)
def login(
    user_in: UserLoginRequest, db: Annotated[Session, Depends(get_db)]
) -> TokenResponse:
    """Authenticate stored credentials and issue a bearer token."""
    user = db.query(User).filter(User.email == user_in.email).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )
    return TokenResponse(access_token=token)


@app.get("/auth/me", response_model=UserResponse)
def get_me(
    payload: Annotated[dict[str, Any], Depends(decode_access_token)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Return the stored profile for a validated token's subject."""
    try:
        user_id = int(payload["sub"])
        if not 0 < user_id <= 2**63 - 1:
            raise ValueError("Invalid user ID")
    except (KeyError, TypeError, ValueError) as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from err
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


@app.get("/auth/users/lookup", response_model=UserSummary)
def lookup_user(
    q: Annotated[str, Query(min_length=1, max_length=254)],
    _payload: Annotated[dict[str, Any], Depends(decode_access_token)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Find an account by exact username or email; requires a valid token.

    Usernames cannot contain "@", so the form of the query decides which field matches.
    The response never includes the email, and nothing is returned for partial matches.
    """
    query = q.strip().lower()
    column = User.email if "@" in query else User.username
    user = db.query(User).filter(func.lower(column) == query).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


@app.get("/auth/users", response_model=list[UserSummary])
def get_users(
    ids: Annotated[list[int], Query(max_length=100)],
    _payload: Annotated[dict[str, Any], Depends(decode_access_token)],
    db: Annotated[Session, Depends(get_db)],
) -> list[User]:
    """Resolve known user ids to usernames, so other services never copy profiles."""
    return db.query(User).filter(User.id.in_(ids)).order_by(User.id).all()
