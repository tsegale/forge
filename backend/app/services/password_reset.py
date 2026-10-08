"""Password reset by email link (OWASP Forgot Password Cheat Sheet).

* The request answers the same way whether or not the address has an account, so it cannot be
  used to discover who shops here; the email goes out from a Celery task, off the request path.
* The token is 32 random bytes; only its SHA-256 hash is stored. It lives for PASSWORD_RESET_TTL,
  works once, and asking again supersedes the previous link.
* The link carries the token in the URL fragment (#token=...), which browsers never send to a
  server or put in a Referer header, so it does not end up in access logs or third-party requests.
* A successful reset revokes every session of the account and sends a "password changed" notice.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime

from flask import current_app
from sqlalchemy import func, select, update

from ..errors import BadRequest
from ..extensions import db
from ..models import PasswordResetToken, RefreshToken, User
from ..security.passwords import hash_password
from .mail import Mail, send


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def reset_link(token: str) -> str:
    """The reset page URL, with the token in the fragment so it never reaches logs."""
    return f"{current_app.config['PUBLIC_BASE_URL']}/reset-password#token={token}"


def request_reset(email: str) -> None:
    """Issue a reset link for an active account. Silently does nothing otherwise."""
    user = db.session.scalar(select(User).where(User.email == email, User.is_active))
    if user is None:
        return
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    # Supersede any live link first: the partial unique index allows one unused token per user.
    db.session.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    db.session.add(
        PasswordResetToken(
            user_id=user.id, token_hash=_hash(token), expires_at=now + current_app.config["PASSWORD_RESET_TTL"]
        )
    )
    db.session.commit()

    from ..tasks import send_password_reset  # the task module imports services; avoid the cycle

    send_password_reset.delay(user.id, token)


def complete_reset(token: str, new_password: str) -> User:
    """Spend the token and set the password, in one transaction: the conditional UPDATE is what
    makes the token single-use, even against two concurrent requests."""
    user_id = db.session.scalar(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == _hash(token),
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > func.now(),
        )
        .values(used_at=func.now())
        .returning(PasswordResetToken.user_id)
    )
    user = db.session.get(User, user_id) if user_id is not None else None
    if user is None or not user.is_active:
        db.session.rollback()
        raise BadRequest("This reset link is invalid or has expired. Ask for a new one.", code="invalid_reset_token")
    user.password_hash = hash_password(new_password)
    db.session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=func.now())
    )
    db.session.commit()

    from ..tasks import send_password_changed

    send_password_changed.delay(user.id)
    return user


def _wrap(paragraphs: list[str]) -> str:
    body = "".join(f"<p>{p}</p>" for p in paragraphs)
    return f'<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#18181b">{body}</div>'


def reset_mail(user: User, token: str) -> Mail:
    """The password reset email."""
    link = reset_link(token)
    minutes = int(current_app.config["PASSWORD_RESET_TTL"].total_seconds() // 60)
    text = (
        f"Hi {user.first_name},\n\n"
        f"Someone asked to reset the password for your Forge account. To choose a new password, open:\n\n{link}\n\n"
        f"The link works once and expires in {minutes} minutes. If you did not ask for this, ignore this email; "
        "your password has not changed.\n\nForge"
    )
    html = _wrap(
        [
            f"Hi {user.first_name},",
            "Someone asked to reset the password for your Forge account.",
            f'<a href="{link}" style="display:inline-block;background:#1e4fa8;color:#ffffff;padding:10px 18px;'
            'border-radius:4px;text-decoration:none;font-weight:600">Choose a new password</a>',
            f"The link works once and expires in {minutes} minutes. If you did not ask for this, ignore this "
            "email; your password has not changed.",
            "Forge",
        ]
    )
    return Mail(to=user.email, subject="Reset your Forge password", text=text, html=html)


def changed_mail(user: User) -> Mail:
    """The email confirming a password change."""
    text = (
        f"Hi {user.first_name},\n\nThe password for your Forge account was just changed, and every device was "
        "signed out. If this was not you, reset your password now and contact us.\n\nForge"
    )
    html = _wrap(
        [
            f"Hi {user.first_name},",
            "The password for your Forge account was just changed, and every device was signed out.",
            "If this was not you, reset your password now and contact us.",
            "Forge",
        ]
    )
    return Mail(to=user.email, subject="Your Forge password was changed", text=text, html=html)


def send_reset(user_id: int, token: str) -> bool:
    """Email a reset link (Celery task body). False if the user no longer exists."""
    user = db.session.get(User, user_id)
    if user is None:
        return False
    send(reset_mail(user, token))
    return True


def send_changed(user_id: int) -> bool:
    """Email a password-changed notice (Celery task body). False if the user is gone."""
    user = db.session.get(User, user_id)
    if user is None:
        return False
    send(changed_mail(user))
    return True
