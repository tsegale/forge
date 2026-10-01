"""Refresh token rotation, reuse detection, and logout."""

import threading
import time
import uuid

import jwt
import pytest
from sqlalchemy import delete, select, text

from app.extensions import db
from app.models import RefreshToken, User
from app.security.passwords import hash_password
from app.security.tokens import decode_refresh
from tests.conftest import DEFAULT_PASSWORD

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
LOGOUT_ALL = "/api/v1/auth/logout-all"
COOKIE = "forge_refresh"


def _cookie_value(response) -> str | None:
    for header in response.headers.getlist("Set-Cookie"):
        if header.startswith(f"{COOKIE}="):
            return header.split(";", 1)[0].split("=", 1)[1]
    return None


def _cleared(response) -> bool:
    return any(
        h.startswith(f"{COOKIE}=;") and "Expires=Thu, 01 Jan 1970" in h for h in response.headers.getlist("Set-Cookie")
    )


@pytest.fixture()
def api(app, session):
    """A client that sends exactly the refresh cookie we give it, so old tokens can be replayed."""
    client = app.test_client(use_cookies=False)

    def post(path, token=None, **kwargs):
        headers = kwargs.pop("headers", {})
        if token:
            headers["Cookie"] = f"{COOKIE}={token}"
        return client.post(path, headers=headers, **kwargs)

    return post


@pytest.fixture()
def logged_in(api, make_user):
    def _login(user=None):
        user = user or make_user()
        response = api(LOGIN, json={"email": user.email, "password": DEFAULT_PASSWORD})
        assert response.status_code == 200
        return user, _cookie_value(response)

    return _login


def _row(session, token) -> RefreshToken:
    # Only locating the row; signature verification has its own tests.
    jti = uuid.UUID(jwt.decode(token, options={"verify_signature": False})["jti"])
    return session.scalar(select(RefreshToken).where(RefreshToken.jti == jti))


# --------------------------------------------------------------------- rotation


def test_refresh_rotates_the_token(api, logged_in, session):
    _, first = logged_in()
    response = api(REFRESH, first)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.get_json()["access_token"]

    second = _cookie_value(response)
    assert second and second != first
    old, new = _row(session, first), _row(session, second)
    assert old.revoked_at is not None and old.replaced_by_jti == new.jti
    assert new.family_id == old.family_id and new.revoked_at is None


def test_rotation_never_extends_the_family_lifetime(api, logged_in, app):
    _, first = logged_in()
    second = _cookie_value(api(REFRESH, first))
    with app.app_context():
        assert decode_refresh(second).family_expires_at == decode_refresh(first).family_expires_at


def test_reusing_a_rotated_token_revokes_the_whole_family(api, logged_in, session):
    _, first = logged_in()
    second = _cookie_value(api(REFRESH, first))

    replay = api(REFRESH, first)  # an attacker replays the stolen, already-rotated token
    assert replay.status_code == 401
    assert replay.get_json()["error"]["code"] == "refresh_token_reused"
    assert _cleared(replay)

    legitimate = api(REFRESH, second)  # the legitimate holder is logged out too
    assert legitimate.status_code == 401
    assert legitimate.get_json()["error"]["code"] == "refresh_token_revoked"
    family = _row(session, first).family_id
    assert all(t.revoked_at for t in session.scalars(select(RefreshToken).where(RefreshToken.family_id == family)))


def test_reuse_does_not_affect_other_sessions(api, logged_in, make_user):
    user = make_user()
    _, laptop = logged_in(user)
    _, phone = logged_in(user)
    api(REFRESH, laptop)
    api(REFRESH, laptop)  # reuse on the laptop family
    assert api(REFRESH, phone).status_code == 200


@pytest.mark.parametrize(
    ("token", "code"),
    [(None, "missing_refresh_token"), ("garbage", "invalid_token")],
)
def test_refresh_rejects_missing_or_invalid_cookie(api, token, code):
    response = api(REFRESH, token)
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == code


def test_refresh_fails_for_deactivated_account(api, logged_in, session):
    user, token = logged_in()
    user.is_active = False
    session.flush()
    response = api(REFRESH, token)
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "account_unavailable"
    assert _row(session, token).revoked_at is not None


# --------------------------------------------------------------------- logout


def test_logout_revokes_the_session_and_clears_the_cookie(api, logged_in):
    _, token = logged_in()
    response = api(LOGOUT, token)
    assert response.status_code == 204
    assert _cleared(response)
    assert api(REFRESH, token).get_json()["error"]["code"] == "refresh_token_revoked"


def test_logout_is_idempotent_without_a_valid_cookie(api):
    assert api(LOGOUT).status_code == 204
    assert api(LOGOUT, "garbage").status_code == 204


def test_logout_all_ends_every_session(api, logged_in, make_user, auth_headers):
    user = make_user()
    _, laptop = logged_in(user)
    _, phone = logged_in(user)
    response = api(LOGOUT_ALL, headers=auth_headers(user))
    assert response.status_code == 204
    assert api(REFRESH, laptop).status_code == 401
    assert api(REFRESH, phone).status_code == 401


def test_logout_all_requires_authentication(api):
    assert api(LOGOUT_ALL).status_code == 401


# --------------------------------------------------------------------- concurrency


def _wait_for_lock_waiters(conn, count: int, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        # pg_stat_activity is snapshotted once per transaction; without this every poll sees the first.
        conn.execute(text("SELECT pg_stat_clear_snapshot()"))
        waiting = conn.execute(
            text(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
            )
        ).scalar_one()
        if waiting >= count:
            return
        time.sleep(0.02)
    raise AssertionError(f"expected {count} sessions blocked on the token row lock")


def test_concurrent_refreshes_with_one_token_rotate_exactly_once(app):
    """Deterministic race: a third connection holds the token row lock until both refreshes are
    blocked behind it, then releases. With SELECT ... FOR UPDATE they queue at the read, so the
    second sees the token already rotated. Without it, both read an unrevoked row and both rotate.
    Runs on real committed transactions, because the row lock is what is under test."""
    email = f"race-{uuid.uuid4().hex[:8]}@example.com"
    with app.app_context():
        db.session.add(User(email=email, password_hash=hash_password(DEFAULT_PASSWORD), first_name="R", last_name="C"))
        db.session.commit()
    try:
        login = app.test_client(use_cookies=False).post(LOGIN, json={"email": email, "password": DEFAULT_PASSWORD})
        token = _cookie_value(login)
        jti = uuid.UUID(jwt.decode(token, options={"verify_signature": False})["jti"])
        results: list[tuple[int, str | None]] = []

        def refresh() -> None:
            response = app.test_client(use_cookies=False).post(REFRESH, headers={"Cookie": f"{COOKIE}={token}"})
            error = (response.get_json() or {}).get("error") or {}
            results.append((response.status_code, error.get("code")))

        with app.app_context(), db.engine.connect() as holder:
            holder.execute(text("SELECT 1 FROM refresh_tokens WHERE jti = :jti FOR UPDATE"), {"jti": jti})
            threads = [threading.Thread(target=refresh) for _ in range(2)]
            for t in threads:
                t.start()
            _wait_for_lock_waiters(holder, 2)
            holder.commit()  # release: the two refreshes now contend for the row
        for t in threads:
            t.join(timeout=30)
            assert not t.is_alive()

        assert sorted(results) == [(200, None), (401, "refresh_token_reused")]
        with app.app_context():
            user_id = db.session.scalar(select(User.id).where(User.email == email))
            rows = db.session.scalars(select(RefreshToken).where(RefreshToken.user_id == user_id)).all()
            assert len(rows) == 2 and all(r.revoked_at is not None for r in rows)
    finally:
        with app.app_context():
            db.session.execute(delete(User).where(User.email == email))
            db.session.commit()
