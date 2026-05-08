# test_main.py — Full test suite for the Drone Update Server
#
# RUN WITH:   pytest test_main.py -v
#
# COVERS:
#   ✅ Health check
#   ✅ Registration — normal + edge cases
#   ✅ Login — normal + edge cases
#   ✅ Version endpoint — normal + edge cases
#   ✅ Update endpoint — normal + edge cases
#   ✅ My info endpoint
#   ✅ Multiple users working independently

import pytest
import os
from fastapi.testclient import TestClient
from main import app, USERS_FILE

client = TestClient(app)


# ─────────────────────────────────────────
# SETUP & TEARDOWN
# Clears users.json before every test so
# tests never interfere with each other.
# ─────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_users():
    """Delete users.json before each test. Runs automatically on every test."""
    if os.path.exists(USERS_FILE):
        os.remove(USERS_FILE)
    yield
    if os.path.exists(USERS_FILE):
        os.remove(USERS_FILE)


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def register_user(username="testuser", password="password123"):
    """Register a user and return the response."""
    return client.post("/register", json={
        "username": username,
        "password": password
    })


def login_user(username="testuser", password="password123"):
    """Log in and return the token string."""
    response = client.post("/login", data={
        "username": username,
        "password": password
    })
    return response.json().get("access_token", "")


def auth_header(token: str) -> dict:
    """Build the Authorization header dict from a token."""
    return {"Authorization": f"Bearer {token}"}


# ══════════════════════════════════════════
# GROUP 1 — HEALTH CHECK
# ══════════════════════════════════════════

def test_server_is_alive():
    """Server should respond to root with 200."""
    response = client.get("/")
    assert response.status_code == 200


def test_server_status_message():
    """Root should say server is online."""
    response = client.get("/")
    assert response.json()["status"] == "Drone update server is online"


# ══════════════════════════════════════════
# GROUP 2 — REGISTRATION (NORMAL CASES)
# ══════════════════════════════════════════

def test_register_success():
    """New user with valid credentials should get 201 Created."""
    response = register_user()
    assert response.status_code == 201


def test_register_returns_username():
    """Registration response should echo back the username."""
    response = register_user("winnie", "securepass")
    assert response.json()["username"] == "winnie"


def test_register_returns_success_message():
    """Registration response should include a success message."""
    response = register_user()
    assert "message" in response.json()


def test_registered_user_can_login():
    """After registering, the user should immediately be able to log in."""
    register_user("newuser", "mypassword")
    response = client.post("/login", data={
        "username": "newuser",
        "password": "mypassword"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()


# ══════════════════════════════════════════
# GROUP 3 — REGISTRATION (EDGE CASES)
# ══════════════════════════════════════════

def test_register_duplicate_username():
    """
    EDGE CASE: registering the same username twice.
    Second attempt should return 409 Conflict.
    """
    register_user("sameuser", "password123")
    response = register_user("sameuser", "differentpassword")
    assert response.status_code == 409
    assert "already taken" in response.json()["detail"]


def test_register_username_too_short():
    """
    EDGE CASE: username under 3 characters.
    Should return 422.
    """
    response = register_user("ab", "password123")
    assert response.status_code == 422


def test_register_password_too_short():
    """
    EDGE CASE: password under 6 characters.
    Should return 422.
    """
    response = register_user("validuser", "abc")
    assert response.status_code == 422


def test_register_empty_username():
    """
    EDGE CASE: empty username string.
    Should be rejected.
    """
    response = register_user("", "password123")
    assert response.status_code == 422


def test_register_empty_password():
    """
    EDGE CASE: empty password string.
    Should be rejected.
    """
    response = register_user("validuser", "")
    assert response.status_code == 422


def test_register_missing_fields():
    """
    EDGE CASE: sending no body at all.
    FastAPI should return 422.
    """
    response = client.post("/register", json={})
    assert response.status_code == 422


# ══════════════════════════════════════════
# GROUP 4 — LOGIN (NORMAL CASES)
# ══════════════════════════════════════════

def test_login_success():
    """Correct credentials should return 200 and a token."""
    register_user()
    response = client.post("/login", data={
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 200


def test_login_returns_token():
    """Login should return access_token and token_type."""
    register_user()
    response = client.post("/login", data={
        "username": "testuser",
        "password": "password123"
    })
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_token_is_not_empty():
    """The token should actually contain something."""
    register_user()
    token = login_user()
    assert len(token) > 0


# ══════════════════════════════════════════
# GROUP 5 — LOGIN (EDGE CASES)
# ══════════════════════════════════════════

def test_login_wrong_password():
    """
    EDGE CASE: correct username, wrong password.
    Should return 401.
    """
    register_user()
    response = client.post("/login", data={
        "username": "testuser",
        "password": "wrongpassword"
    })
    assert response.status_code == 401


def test_login_username_not_registered():
    """
    EDGE CASE: username that was never registered.
    Should return 401.
    """
    response = client.post("/login", data={
        "username": "ghostuser",
        "password": "password123"
    })
    assert response.status_code == 401


def test_login_error_message_is_vague():
    """
    EDGE CASE / SECURITY: error should not reveal whether
    the username or password was wrong — attackers could use that.
    Both wrong username and wrong password should return the same message.
    """
    register_user()
    r1 = client.post("/login", data={"username": "testuser",  "password": "wrong"})
    r2 = client.post("/login", data={"username": "noexist",   "password": "password123"})
    assert r1.json()["detail"] == r2.json()["detail"]


def test_login_empty_fields():
    """
    EDGE CASE: sending nothing.
    Should return 422.
    """
    response = client.post("/login", data={})
    assert response.status_code == 422


# ══════════════════════════════════════════
# GROUP 6 — VERSION ENDPOINT (NORMAL CASES)
# ══════════════════════════════════════════

def test_version_with_valid_token():
    """Logged-in user should get 200 from /version."""
    register_user()
    token    = login_user()
    response = client.get("/version", headers=auth_header(token))
    assert response.status_code == 200


def test_version_has_all_fields():
    """Version response must have latest_version, release_notes, expo_update_channel."""
    register_user()
    token    = login_user()
    response = client.get("/version", headers=auth_header(token))
    data     = response.json()
    assert "latest_version"      in data
    assert "release_notes"       in data
    assert "expo_update_channel" in data


def test_version_format_is_xyz():
    """
    Version number must be in X.Y.Z format.
    Each part must be a number.
    """
    register_user()
    token    = login_user()
    response = client.get("/version", headers=auth_header(token))
    version  = response.json()["latest_version"]
    parts    = version.split(".")
    assert len(parts) == 3, f"Expected X.Y.Z format, got: {version}"
    assert all(p.isdigit() for p in parts), "All version parts must be numbers"


def test_version_expo_channel_is_main():
    """Expo update channel should be 'main'."""
    register_user()
    token    = login_user()
    response = client.get("/version", headers=auth_header(token))
    assert response.json()["expo_update_channel"] == "main"


# ══════════════════════════════════════════
# GROUP 7 — VERSION ENDPOINT (EDGE CASES)
# ══════════════════════════════════════════

def test_version_without_token():
    """
    EDGE CASE: no token at all.
    Should return 401.
    """
    response = client.get("/version")
    assert response.status_code == 401


def test_version_with_fake_token():
    """
    EDGE CASE: made-up token string.
    Should return 401.
    """
    response = client.get("/version", headers=auth_header("totally-fake-token"))
    assert response.status_code == 401


def test_version_with_malformed_header():
    """
    EDGE CASE: Authorization header missing the 'Bearer' prefix.
    Should return 401.
    """
    register_user()
    token    = login_user()
    response = client.get("/version", headers={"Authorization": token})
    assert response.status_code == 401


def test_version_wrong_http_method():
    """
    EDGE CASE: POST to a GET-only endpoint.
    Should return 405 Method Not Allowed.
    """
    register_user()
    token    = login_user()
    response = client.post("/version", headers=auth_header(token))
    assert response.status_code == 405


# ══════════════════════════════════════════
# GROUP 8 — UPDATE ENDPOINT
# ══════════════════════════════════════════

def test_update_with_valid_token():
    """Valid token should get 200 from /update."""
    register_user()
    token    = login_user()
    response = client.get("/update", headers=auth_header(token))
    assert response.status_code == 200


def test_update_has_version_and_channel():
    """Update response must include version and expo_update_channel."""
    register_user()
    token    = login_user()
    response = client.get("/update", headers=auth_header(token))
    data     = response.json()
    assert "version"             in data
    assert "expo_update_channel" in data


def test_update_without_token():
    """
    EDGE CASE: no token.
    Should return 401.
    """
    response = client.get("/update")
    assert response.status_code == 401


def test_update_with_fake_token():
    """
    EDGE CASE: fake token.
    Should return 401.
    """
    response = client.get("/update", headers=auth_header("fake-token-xyz"))
    assert response.status_code == 401


def test_update_wrong_method():
    """
    EDGE CASE: POST to a GET-only endpoint.
    Should return 405.
    """
    register_user()
    token    = login_user()
    response = client.post("/update", headers=auth_header(token))
    assert response.status_code == 405


# ══════════════════════════════════════════
# GROUP 9 — MY INFO ENDPOINT
# ══════════════════════════════════════════

def test_me_returns_username():
    """Logged-in user should get their own username back from /me."""
    register_user("winnie", "securepass")
    token    = login_user("winnie", "securepass")
    response = client.get("/me", headers=auth_header(token))
    assert response.status_code == 200
    assert response.json()["username"] == "winnie"


def test_me_without_token():
    """
    EDGE CASE: /me without a token.
    Should return 401.
    """
    response = client.get("/me")
    assert response.status_code == 401


# ══════════════════════════════════════════
# GROUP 10 — MULTIPLE USERS
# Makes sure different users don't interfere
# with each other — critical for a real product.
# ══════════════════════════════════════════

def test_multiple_users_can_register():
    """Three different users should all be able to register successfully."""
    r1 = register_user("user_one",   "password111")
    r2 = register_user("user_two",   "password222")
    r3 = register_user("user_three", "password333")
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r3.status_code == 201


def test_each_user_gets_their_own_token():
    """
    Two users logging in should get different tokens.
    Tokens are tied to the individual user.
    """
    register_user("alpha", "passalpha1")
    register_user("beta",  "passbeta12")
    token_a = login_user("alpha", "passalpha1")
    token_b = login_user("beta",  "passbeta12")
    assert token_a != token_b


def test_user_a_token_shows_user_a_in_me():
    """
    Each user's token should only reveal their own info —
    not someone else's.
    """
    register_user("alice", "alicepass1")
    register_user("bob",   "bobpassword")
    token_alice = login_user("alice", "alicepass1")
    token_bob   = login_user("bob",   "bobpassword")

    resp_alice = client.get("/me", headers=auth_header(token_alice))
    resp_bob   = client.get("/me", headers=auth_header(token_bob))

    assert resp_alice.json()["username"] == "alice"
    assert resp_bob.json()["username"]   == "bob"


def test_user_wrong_password_doesnt_affect_others():
    """
    EDGE CASE: one user failing to log in should not
    affect another user's ability to log in.
    """
    register_user("gooduser", "goodpassword1")
    register_user("baduser",  "badpassword12")

    # baduser tries wrong password
    client.post("/login", data={"username": "baduser", "password": "wrongwrong"})

    # gooduser should still work fine
    response = client.post("/login", data={
        "username": "gooduser",
        "password": "goodpassword1"
    })
    assert response.status_code == 200