import os
import re
from collections.abc import Generator

from sqlalchemy import String, create_engine, inspect, select, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
database_url: str | URL

if DATABASE_URL:
    database_url = DATABASE_URL
else:
    database_url = URL.create(
        drivername="postgresql+psycopg",
        username=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        host=os.environ["POSTGRES_HOST"],
        port=5432,
        database=os.environ["POSTGRES_DB"],
    )

connect_args = (
    {"check_same_thread": False} if str(database_url).startswith("sqlite") else {}
)

engine = create_engine(database_url, connect_args=connect_args)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


USERNAME_MIN = 3
USERNAME_MAX = 32


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(
        String(USERNAME_MAX), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="user", nullable=False)


def get_db() -> Generator[Session, None, None]:
    """Provide a database session and close it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def derive_username(email: str, taken: set[str]) -> str:
    """Build a unique username from the local part of an email address."""
    base = re.sub(r"[^a-z0-9_.-]", "", email.split("@")[0].lower()).lstrip("_.-")
    base = base.ljust(USERNAME_MIN, "0")[: USERNAME_MAX - 6]
    candidate, suffix = base, 1
    while candidate in taken:
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate


def upgrade_schema() -> None:
    """Add and backfill users.username on databases created before usernames existed.

    create_all only creates missing tables, so an existing users table needs this one-off,
    idempotent upgrade. Backfilled usernames come from the email local part.
    """
    if "username" in {c["name"] for c in inspect(engine).get_columns("users")}:
        return
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(32)"))
        rows = connection.execute(select(User.id, User.email).order_by(User.id)).all()
        taken: set[str] = set()
        for user_id, email in rows:
            username = derive_username(email, taken)
            taken.add(username)
            connection.execute(
                text("UPDATE users SET username = :username WHERE id = :id"),
                {"username": username, "id": user_id},
            )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_username ON users (username)"
            )
        )
