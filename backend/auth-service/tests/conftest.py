import os
import secrets

# Set isolated test configuration before app imports, including in test_health.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = secrets.token_urlsafe(32)
os.environ["CORS_ORIGINS"] = "http://localhost:3000"
