"""Exercise saved auth and document data across Compose service restarts."""

import http.cookiejar
import json
import os
import secrets
import subprocess
import time
import urllib.error
import urllib.request

base = os.getenv("E2E_BASE_URL", "http://127.0.0.1:8080")
client = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
)


def request(path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        base + path,
        data=body,
        headers={"Content-Type": "application/json", "Origin": base},
    )
    with client.open(req, timeout=15) as response:
        return json.load(response)


def wait_for(path, data=None):
    deadline = time.monotonic() + 120
    while True:
        try:
            return request(path, data)
        except (urllib.error.URLError, TimeoutError):
            if time.monotonic() >= deadline:
                raise RuntimeError("Services did not become ready") from None
            time.sleep(1)


credentials = {
    "email": f"persistence-{secrets.token_hex(8)}@example.com",
    "password": secrets.token_urlsafe(24),
}
wait_for("/api/auth/signup", credentials)
request("/api/auth/login", credentials)
draft = {"title": "Restart persistence check", "markdown": "# Durable Markdown\n\nSaved."}
wait_for("/api/documents")
saved = request("/api/documents", draft)
subprocess.run(
    ["docker", "compose", "restart", "postgres", "auth", "document"], check=True
)
wait_for("/api/auth/login", credentials)
reopened = wait_for(f"/api/documents/{saved['id']}")
assert reopened["title"] == draft["title"]
assert reopened["markdown"] == draft["markdown"]
assert reopened["authorId"] == saved["authorId"]
print("PASS: account login and saved Markdown survived PostgreSQL and service restarts")
