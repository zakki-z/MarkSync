import os
import subprocess
import sys

import pytest


@pytest.mark.parametrize("secret", [None, "", "short", " " * 32])
def test_missing_or_weak_jwt_secret_fails_clearly(secret: str | None) -> None:
    """Startup must fail clearly without an explicitly supplied strong key."""
    env = os.environ.copy()
    env.pop("JWT_SECRET_KEY", None)
    if secret is not None:
        env["JWT_SECRET_KEY"] = secret
    result = subprocess.run(
        [sys.executable, "-c", "import app.auth"],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "JWT_SECRET_KEY must be set" in result.stderr
