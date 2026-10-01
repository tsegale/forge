"""Registration, login, and session (token family) issuing."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from flask import current_app
from sqlalchemy import select

from ..errors import Forbidden, Unauthorized
from ..extensions import db
from ..models import RefreshToken, User
from ..schemas.auth import RegisterRequest
from ..security.passwords import burn_verification, hash_password, needs_rehash, verify_password
from ..security.tokens import AccessToken, issue_access_token, issue_refresh_token


@dataclass(frozen=True, slots=True)
class IssuedSession:
    access: AccessToken
    refresh_token: str
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
    return IssuedSession(issue_access_token(user.id, user.role.value), refresh, expires_at)


def start_session(user: User) -> IssuedSession:
    """A fresh login starts a new token family with its own absolute lifetime."""
    family_expires_at = datetime.now(UTC) + current_app.config["REFRESH_FAMILY_TTL"]
    session = issue_session(user, uuid.uuid4(), family_expires_at)
    db.session.commit()
    return session
