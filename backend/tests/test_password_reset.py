"""Password reset: no account enumeration, single-use hashed tokens, sessions revoked on success."""

import hashlib
import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.models import PasswordResetToken, RefreshToken
from app.services.mail import outbox
from tests.conftest import DEFAULT_PASSWORD

REQUEST = "/api/v1/auth/password-reset"
CONFIRM = "/api/v1/auth/password-reset/confirm"
NEW_PASSWORD = "a-brand-new-passphrase"
TOKEN_LINK = re.compile(r"/reset-password#token=([A-Za-z0-9_-]+)")


@pytest.fixture(autouse=True)
def empty_outbox(app):
    with app.app_context():
        outbox().clear()


@pytest.fixture()
def customer(make_user):
    return make_user(email="reset@example.com")


def _ask(client, email="reset@example.com"):
    response = client.post(REQUEST, json={"email": email})
    assert response.status_code == 202, response.get_json()
    return response.get_json()


def _token_from_mail() -> str:
    [mail] = [m for m in outbox() if m.subject == "Reset your Forge password"][-1:]
    match = TOKEN_LINK.search(mail.text)
    assert match and match.group(0) in mail.html
    return match.group(1)


def test_the_answer_is_the_same_with_or_without_an_account(client, customer):
    known = _ask(client)
    unknown = _ask(client, "nobody@example.com")
    assert known == unknown
    assert [m.to for m in outbox()] == ["reset@example.com"]


def test_only_a_hash_is_stored_and_the_link_uses_the_fragment(client, session, customer, app):
    _ask(client)
    token = _token_from_mail()
    [mail] = outbox()
    assert f"{app.config['PUBLIC_BASE_URL']}/reset-password#token={token}" in mail.text
    row = session.scalar(select(PasswordResetToken).where(PasswordResetToken.user_id == customer.id))
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in row.token_hash


def test_reset_sets_the_password_signs_out_everywhere_and_notifies(client, session, customer):
    login = client.post("/api/v1/auth/login", json={"email": customer.email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 200, login.get_json()
    _ask(client)
    response = client.post(CONFIRM, json={"token": _token_from_mail(), "password": NEW_PASSWORD})
    assert response.status_code == 204

    active = session.scalars(
        select(RefreshToken).where(RefreshToken.user_id == customer.id, RefreshToken.revoked_at.is_(None))
    ).all()
    assert active == []
    assert outbox()[-1].subject == "Your Forge password was changed"
    relogin = client.post("/api/v1/auth/login", json={"email": customer.email, "password": NEW_PASSWORD})
    assert relogin.status_code == 200


def test_a_link_works_once(client, customer):
    _ask(client)
    token = _token_from_mail()
    assert client.post(CONFIRM, json={"token": token, "password": NEW_PASSWORD}).status_code == 204
    again = client.post(CONFIRM, json={"token": token, "password": "yet-another-passphrase"})
    assert again.status_code == 400 and again.get_json()["error"]["code"] == "invalid_reset_token"


def test_asking_again_supersedes_the_previous_link(client, session, customer):
    _ask(client)
    first = _token_from_mail()
    _ask(client)
    second = _token_from_mail()
    assert first != second
    assert client.post(CONFIRM, json={"token": first, "password": NEW_PASSWORD}).status_code == 400
    assert client.post(CONFIRM, json={"token": second, "password": NEW_PASSWORD}).status_code == 204


def test_an_expired_link_is_refused(client, session, customer):
    _ask(client)
    token = _token_from_mail()
    session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == customer.id)
        .values(created_at=datetime.now(UTC) - timedelta(hours=2), expires_at=datetime.now(UTC) - timedelta(hours=1))
    )
    assert client.post(CONFIRM, json={"token": token, "password": NEW_PASSWORD}).status_code == 400


def test_a_deactivated_account_gets_no_link(client, session, customer):
    customer.is_active = False
    session.flush()
    _ask(client)
    assert outbox() == []


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"token": "x" * 40, "password": "short"}, 422),  # same password policy as registration
        ({"token": "short", "password": NEW_PASSWORD}, 422),
        ({"token": "x" * 40, "password": NEW_PASSWORD}, 400),  # well formed, but no such token
    ],
)
def test_confirm_validates_input(client, body, status):
    assert client.post(CONFIRM, json=body).status_code == status


def test_requests_are_limited_per_address(client, customer):
    for _ in range(3):
        _ask(client)
    limited = client.post(REQUEST, json={"email": "reset@example.com"})
    assert limited.status_code == 429


def test_the_database_allows_one_live_link_per_user(session, customer):
    expires = datetime.now(UTC) + timedelta(minutes=30)
    session.add_all(
        [
            PasswordResetToken(user_id=customer.id, token_hash="a" * 64, expires_at=expires),
            PasswordResetToken(user_id=customer.id, token_hash="b" * 64, expires_at=expires),
        ]
    )
    with pytest.raises(IntegrityError, match="uq_password_reset_tokens_one_active"):
        session.flush()


def test_the_database_only_stores_hex_hashes(session, customer):
    session.add(
        PasswordResetToken(
            user_id=customer.id, token_hash="not-a-hash".ljust(64, "x"), expires_at=datetime.now(UTC) + timedelta(1)
        )
    )
    with pytest.raises(IntegrityError, match="ck_password_reset_tokens_token_hash_hex"):
        session.flush()
