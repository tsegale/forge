"""Registration, login, and session (token family) issuing."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from flask import current_app
from sqlalchemy import select, update

from ..errors import Forbidden, Unauthorized
from ..extensions import db
from ..models import RefreshToken, User
from ..schemas.auth import RegisterRequest
from ..security.passwords import burn_verification, hash_password, needs_rehash, verify_password
from ..security.tokens import AccessToken, decode_refresh, issue_access_token, issue_refresh_token


@dataclass(frozen=True, slots=True)
class IssuedSession:
    access: AccessToken
    refresh_token: str
    refresh_jti: uuid.UUID
    refresh_expires_at: datetime


def register(data: RegisterRequest) -> User:
    """Create a customer account. Email uniqueness is enforced by the database (CITEXT unique),
    not a pre-check, so concurrent sign-ups cannot race; the violation maps to 409 email_taken."""
    user = User(
        email=str(data.email),
        password_hash=hash_password(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
    )
    db.session.add(user)
    db.session.commit()
    return user


def authenticate(email: str, password: str) -> User:
    user = db.session.scalar(select(User).where(User.email == email))
    if user is None:
        burn_verification(password)
        raise Unauthorized("Incorrect email or password.", code="invalid_credentials", headers={})
    if not verify_password(user.password_hash, password):
        raise Unauthorized("Incorrect email or password.", code="invalid_credentials", headers={})
    # Only disclosed once the caller has proven they know the password.
    if not user.is_active:
        raise Forbidden("This account has been deactivated.", code="account_disabled")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        db.session.commit()
    return user


def issue_session(user: User, family_id: uuid.UUID, family_expires_at: datetime) -> IssuedSession:
    """Mint an access token and a recorded refresh token in ``family_id``. Caller commits."""
    jti = uuid.uuid4()
    refresh, expires_at = issue_refresh_token(user.id, jti, family_id, family_expires_at)
    db.session.add(RefreshToken(jti=jti, family_id=family_id, user_id=user.id, expires_at=expires_at))
    return IssuedSession(issue_access_token(user.id, user.role.value), refresh, jti, expires_at)


def start_session(user: User) -> IssuedSession:
    """A fresh login starts a new token family with its own absolute lifetime."""
    family_expires_at = datetime.now(UTC) + current_app.config["REFRESH_FAMILY_TTL"]
    session = issue_session(user, uuid.uuid4(), family_expires_at)
    db.session.commit()
    return session


def _revoke(*conditions: object) -> None:
    db.session.execute(
        update(RefreshToken).where(RefreshToken.revoked_at.is_(None), *conditions).values(revoked_at=datetime.now(UTC))
    )


def rotate(refresh_token: str) -> IssuedSession:
    """Exchange a refresh token for a new pair, revoking the presented one.

    The token row is locked (SELECT ... FOR UPDATE), so concurrent refreshes with the same
    token serialise: exactly one rotates it, and the rest see it already revoked. Presenting a
    revoked token means it was copied, so the whole family is revoked (RFC 9700, section 4.14.2).
    """
    claims = decode_refresh(refresh_token)
    row = db.session.scalar(select(RefreshToken).where(RefreshToken.jti == claims.jti).with_for_update())
    if row is None or row.user_id != claims.user_id or row.family_id != claims.family_id:
        raise Unauthorized("The refresh token is invalid.", code="invalid_token")

    if row.revoked_at is not None:
        _revoke(RefreshToken.family_id == row.family_id)
        db.session.commit()
        code = "refresh_token_reused" if row.replaced_by_jti is not None else "refresh_token_revoked"
        raise Unauthorized("This session has ended. Sign in again.", code=code)

    user = db.session.get(User, row.user_id)
    if user is None or not user.is_active:
        _revoke(RefreshToken.family_id == row.family_id)
        db.session.commit()
        raise Unauthorized("The account is not available.", code="account_unavailable")

    issued = issue_session(user, row.family_id, claims.family_expires_at)
    row.revoked_at = datetime.now(UTC)
    row.replaced_by_jti = issued.refresh_jti
    db.session.commit()
    return issued


def end_session(refresh_token: str) -> None:
    """Log out: revoke the presented token's family. Unknown or invalid tokens are ignored,
    so logout is idempotent and reveals nothing about the token."""
    try:
        claims = decode_refresh(refresh_token)
    except Unauthorized:
        return
    _revoke(RefreshToken.family_id == claims.family_id, RefreshToken.user_id == claims.user_id)
    db.session.commit()


def end_all_sessions(user: User) -> None:
    _revoke(RefreshToken.user_id == user.id)
    db.session.commit()
