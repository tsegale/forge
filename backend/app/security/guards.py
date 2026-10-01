"""Route guards: ``@require_auth`` and ``@require_role(...)``.

The user row is loaded on every authenticated request. That costs one primary-key lookup, and
in exchange a deactivated account or a changed role takes effect immediately instead of when
the access token happens to expire.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import wraps
from typing import Any

from flask import g, request

from ..errors import Forbidden, Unauthorized
from ..extensions import db
from ..models import User
from ..models.enums import UserRole
from .tokens import TokenType, decode


def _bearer_token() -> str:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise Unauthorized("Send an access token as 'Authorization: Bearer <token>'.")
    return token.strip()


def _authenticate() -> User:
    claims = decode(_bearer_token(), TokenType.ACCESS)
    try:
        user_id = int(claims["sub"])
    except ValueError as exc:
        raise Unauthorized("The token is invalid.", code="invalid_token") from exc
    user = db.session.get(User, user_id)
    if user is None or not user.is_active:
        raise Unauthorized("The account is not available.", code="account_unavailable")
    return user


def optional_user() -> User | None:
    """The caller if they sent an access token, else None. A token that is sent but invalid is
    still a 401: silently treating it as anonymous would hide expired sessions from the client."""
    if "Authorization" not in request.headers:
        return None
    return _authenticate()


def current_user() -> User:
    """The authenticated user for this request. Only valid inside a guarded view."""
    return g.current_user


def require_auth[F: Callable[..., Any]](view: F) -> F:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        g.current_user = _authenticate()
        return view(*args, **kwargs)

    return wrapper  # type: ignore[return-value]  # functools.wraps preserves the signature


def require_role(*roles: UserRole) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    allowed = frozenset(roles)

    def decorator[F: Callable[..., Any]](view: F) -> F:
        @wraps(view)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            user = _authenticate()
            if user.role not in allowed:
                raise Forbidden()
            g.current_user = user
            return view(*args, **kwargs)

        return wrapper  # type: ignore[return-value]  # functools.wraps preserves the signature

    return decorator
