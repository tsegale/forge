"""JWT issuing and verification.

Access tokens are short-lived and stateless. Refresh tokens are long-lived, but each one is also
recorded in ``refresh_tokens`` so it can be rotated, revoked, and checked for reuse.

Verification pins the algorithm (no ``alg: none`` or algorithm confusion), requires every claim
we rely on, and checks ``typ`` so a refresh token can never be presented as an access token.
"""

from __future__ import annotations

import enum
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import jwt
from flask import current_app

from ..errors import Unauthorized


class TokenType(enum.StrEnum):
    ACCESS = "access"
    REFRESH = "refresh"


_REQUIRED_CLAIMS = {
    TokenType.ACCESS: ["iss", "aud", "sub", "iat", "nbf", "exp", "jti", "typ", "role"],
    TokenType.REFRESH: ["iss", "aud", "sub", "iat", "nbf", "exp", "jti", "typ", "fam", "fexp"],
}


@dataclass(frozen=True, slots=True)
class AccessToken:
    token: str
    expires_in: int  # seconds


@dataclass(frozen=True, slots=True)
class RefreshClaims:
    user_id: int
    jti: uuid.UUID
    family_id: uuid.UUID
    expires_at: datetime
    family_expires_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


def _encode(claims: dict[str, Any]) -> str:
    cfg = current_app.config
    return jwt.encode(
        {"iss": cfg["JWT_ISSUER"], "aud": cfg["JWT_AUDIENCE"], **claims},
        cfg["JWT_SECRET_KEY"],
        algorithm=cfg["JWT_ALGORITHM"],
    )


def issue_access_token(user_id: int, role: str) -> AccessToken:
    now = _now()
    ttl = current_app.config["ACCESS_TOKEN_TTL"]
    token = _encode(
        {
            "sub": str(user_id),
            "role": role,
            "typ": TokenType.ACCESS.value,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "nbf": now,
            "exp": now + ttl,
        }
    )
    return AccessToken(token=token, expires_in=int(ttl.total_seconds()))


def issue_refresh_token(
    user_id: int, jti: uuid.UUID, family_id: uuid.UUID, family_expires_at: datetime
) -> tuple[str, datetime]:
    """Return a new token and its expiry. Expiry never exceeds the family's absolute lifetime."""
    expires_at = min(_now() + current_app.config["REFRESH_TOKEN_TTL"], family_expires_at)
    return encode_refresh_token(user_id, jti, family_id, family_expires_at, expires_at), expires_at


def encode_refresh_token(
    user_id: int, jti: uuid.UUID, family_id: uuid.UUID, family_expires_at: datetime, expires_at: datetime
) -> str:
    """Sign a refresh token for an already-recorded ``jti`` with its stored expiry. Used to hand
    the existing successor back during the reuse grace window without creating a new token."""
    now = _now()
    return _encode(
        {
            "sub": str(user_id),
            "typ": TokenType.REFRESH.value,
            "jti": str(jti),
            "fam": str(family_id),
            "fexp": int(family_expires_at.timestamp()),
            "iat": now,
            "nbf": now,
            "exp": expires_at,
        }
    )


def decode(token: str, expected: TokenType) -> dict[str, Any]:
    cfg = current_app.config
    try:
        claims = jwt.decode(
            token,
            cfg["JWT_SECRET_KEY"],
            algorithms=[cfg["JWT_ALGORITHM"]],
            audience=cfg["JWT_AUDIENCE"],
            issuer=cfg["JWT_ISSUER"],
            options={"require": _REQUIRED_CLAIMS[expected]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized("The token has expired.", code="token_expired") from exc
    except jwt.InvalidTokenError as exc:
        raise Unauthorized("The token is invalid.", code="invalid_token") from exc
    if claims.get("typ") != expected.value:
        raise Unauthorized("The token is invalid.", code="invalid_token")
    return claims


def decode_refresh(token: str) -> RefreshClaims:
    claims = decode(token, TokenType.REFRESH)
    try:
        return RefreshClaims(
            user_id=int(claims["sub"]),
            jti=uuid.UUID(claims["jti"]),
            family_id=uuid.UUID(claims["fam"]),
            expires_at=datetime.fromtimestamp(claims["exp"], UTC),
            family_expires_at=datetime.fromtimestamp(claims["fexp"], UTC),
        )
    except (TypeError, ValueError) as exc:
        raise Unauthorized("The token is invalid.", code="invalid_token") from exc
