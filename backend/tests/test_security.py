"""Password hashing and token issuing/verification, including the attacks verification must reject."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from argon2 import PasswordHasher

from app.config import ProductionConfig
from app.errors import Unauthorized
from app.security.passwords import hash_password, needs_rehash, verify_password
from app.security.tokens import TokenType, decode, decode_refresh, issue_access_token, issue_refresh_token


@pytest.fixture()
def ctx(app):
    with app.app_context():
        yield app


def _claims(app, **overrides):
    now = datetime.now(UTC)
    base = {
        "iss": app.config["JWT_ISSUER"],
        "aud": app.config["JWT_AUDIENCE"],
        "sub": "1",
        "role": "customer",
        "typ": "access",
        "jti": uuid.uuid4().hex,
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=5),
    }
    return base | overrides


def _sign(app, claims, key=None, algorithm="HS256"):
    return jwt.encode(claims, key or app.config["JWT_SECRET_KEY"], algorithm=algorithm)


def _rejected(token, expected=TokenType.ACCESS) -> str:
    with pytest.raises(Unauthorized) as exc:
        decode(token, expected)
    return exc.value.code


# --------------------------------------------------------------------- passwords


def test_password_round_trip():
    hashed = hash_password("correct horse battery staple")
    assert hashed.startswith("$argon2id$")
    assert verify_password(hashed, "correct horse battery staple")
    assert not verify_password(hashed, "wrong password")


def test_malformed_hash_fails_closed():
    assert not verify_password("not-a-hash", "anything")


def test_weaker_parameters_need_rehash():
    weak = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash("pw")
    assert needs_rehash(weak)
    assert not needs_rehash(hash_password("pw"))


# --------------------------------------------------------------------- access tokens


def test_access_token_round_trip(ctx):
    issued = issue_access_token(42, "admin")
    claims = decode(issued.token, TokenType.ACCESS)
    assert claims["sub"] == "42" and claims["role"] == "admin"
    assert issued.expires_in == 15 * 60


def test_expired_token_is_rejected_with_specific_code(ctx):
    past = datetime.now(UTC) - timedelta(hours=1)
    token = _sign(ctx, _claims(ctx, iat=past, nbf=past, exp=past + timedelta(minutes=1)))
    assert _rejected(token) == "token_expired"


@pytest.mark.parametrize(
    "tamper",
    [
        pytest.param(lambda app: jwt.encode(_claims(app), None, algorithm="none"), id="alg-none"),
        pytest.param(lambda app: _sign(app, _claims(app), key="x" * 64), id="wrong-key"),
        pytest.param(
            lambda app: _sign(app, _claims(app), algorithm="HS512"),
            id="unpinned-algorithm",
            # The forger's key length is irrelevant here; the algorithm is what must be refused.
            marks=pytest.mark.filterwarnings("ignore::jwt.warnings.InsecureKeyLengthWarning"),
        ),
        pytest.param(lambda app: _sign(app, _claims(app, aud="someone-else")), id="wrong-audience"),
        pytest.param(lambda app: _sign(app, _claims(app, iss="someone-else")), id="wrong-issuer"),
        pytest.param(
            lambda app: _sign(app, {k: v for k, v in _claims(app).items() if k != "role"}), id="missing-claim"
        ),
        pytest.param(lambda app: _sign(app, _claims(app, typ="refresh")), id="wrong-type"),
        pytest.param(lambda app: issue_access_token(1, "customer").token[:-4] + "AAAA", id="bad-signature"),
        pytest.param(lambda app: "not.a.jwt", id="garbage"),
    ],
)
def test_forged_or_malformed_access_tokens_are_rejected(ctx, tamper):
    assert _rejected(tamper(ctx)) == "invalid_token"


# --------------------------------------------------------------------- refresh tokens


def test_refresh_token_round_trip(ctx):
    jti, family = uuid.uuid4(), uuid.uuid4()
    family_expiry = datetime.now(UTC) + timedelta(days=30)
    token, expires_at = issue_refresh_token(7, jti, family, family_expiry)
    claims = decode_refresh(token)
    assert (claims.user_id, claims.jti, claims.family_id) == (7, jti, family)
    assert claims.expires_at == expires_at.replace(microsecond=0)


def test_refresh_expiry_is_capped_by_family_lifetime(ctx):
    family_expiry = datetime.now(UTC) + timedelta(days=2)
    _, expires_at = issue_refresh_token(7, uuid.uuid4(), uuid.uuid4(), family_expiry)
    assert expires_at == family_expiry


def test_tokens_cannot_cross_types(ctx):
    access = issue_access_token(1, "customer").token
    refresh, _ = issue_refresh_token(1, uuid.uuid4(), uuid.uuid4(), datetime.now(UTC) + timedelta(days=30))
    assert _rejected(refresh, TokenType.ACCESS) == "invalid_token"
    assert _rejected(access, TokenType.REFRESH) == "invalid_token"


# --------------------------------------------------------------------- configuration


def test_short_jwt_key_is_refused_at_startup(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "too-short")
    with pytest.raises(RuntimeError, match="at least 32 bytes"):
        ProductionConfig()
