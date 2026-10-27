import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.database import Base, User, engine, get_db


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Create missing authentication tables on startup."""
    Base.metadata.create_all(bind=engine)
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


class UserSignupRequest(BaseModel):
    email: EmailStr
    password: str


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    role: str
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
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        role="user",
    )
    db.add(new_user)
    db.commit()
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
