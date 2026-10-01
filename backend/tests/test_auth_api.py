"""Registration, login and the authenticated profile endpoint."""

from argon2 import PasswordHasher
from sqlalchemy import select

from app.models import RefreshToken, User
from tests.conftest import DEFAULT_PASSWORD

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"


def _signup(**overrides):
    return {
        "email": "Ada@Example.com",
        "password": "a long enough passphrase",
        "first_name": " Ada ",
        "last_name": "Lovelace",
    } | overrides


def _refresh_cookie(response):
    headers = [h for h in response.headers.getlist("Set-Cookie") if h.startswith("forge_refresh=")]
    assert len(headers) == 1
    return headers[0]


# --------------------------------------------------------------------- register


def test_register_creates_customer(client, session):
    response = client.post(REGISTER, json=_signup())
    assert response.status_code == 201
    body = response.get_json()
    assert body["email"] == "Ada@example.com"  # domain normalised, local part preserved
    assert body["first_name"] == "Ada"
    assert body["role"] == "customer"
    assert "password" not in str(body) and "hash" not in str(body)
    user = session.get(User, body["id"])
    assert user.password_hash.startswith("$argon2id$")


def test_register_cannot_choose_role(client):
    response = client.post(REGISTER, json=_signup(role="admin"))
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["field"] == "role"


def test_register_rejects_duplicate_email_case_insensitively(client):
    assert client.post(REGISTER, json=_signup()).status_code == 201
    response = client.post(REGISTER, json=_signup(email="ADA@example.COM"))
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "email_taken"


def test_register_validates_fields(client):
    response = client.post(REGISTER, json=_signup(email="not-an-email", password="short", last_name="   "))
    assert response.status_code == 422
    fields = {d["field"] for d in response.get_json()["error"]["details"]}
    assert fields == {"email", "password", "last_name"}


# --------------------------------------------------------------------- login


def test_login_returns_access_token_and_hardened_refresh_cookie(client, session, make_user):
    user = make_user(email="login@example.com")
    response = client.post(LOGIN, json={"email": "LOGIN@example.com", "password": DEFAULT_PASSWORD})
    assert response.status_code == 200
    body = response.get_json()
    assert body["token_type"] == "Bearer" and body["expires_in"] == 900 and body["access_token"]

    cookie = _refresh_cookie(response)
    for attribute in ("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/v1/auth", "Expires="):
        assert attribute in cookie
    assert session.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id)).one().revoked_at is None


def test_wrong_password_and_unknown_email_are_indistinguishable(client, make_user):
    make_user(email="known@example.com")
    wrong = client.post(LOGIN, json={"email": "known@example.com", "password": "not the password"})
    unknown = client.post(LOGIN, json={"email": "nobody@example.com", "password": "not the password"})
    assert wrong.status_code == unknown.status_code == 401
    strip = lambda r: {k: v for k, v in r.get_json()["error"].items() if k != "request_id"}  # noqa: E731
    assert strip(wrong) == strip(unknown) and strip(wrong)["code"] == "invalid_credentials"
    assert "Set-Cookie" not in wrong.headers


def test_deactivated_account_cannot_log_in(client, make_user):
    make_user(email="gone@example.com", is_active=False)
    response = client.post(LOGIN, json={"email": "gone@example.com", "password": DEFAULT_PASSWORD})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "account_disabled"


def test_login_upgrades_outdated_password_hash(client, session, make_user):
    user = make_user(email="legacy@example.com")
    user.password_hash = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash(DEFAULT_PASSWORD)
    session.flush()
    response = client.post(LOGIN, json={"email": "legacy@example.com", "password": DEFAULT_PASSWORD})
    assert response.status_code == 200
    session.refresh(user)
    assert "m=65536,t=3,p=4" in user.password_hash


# --------------------------------------------------------------------- me


def test_me_returns_the_authenticated_user(client, make_user, auth_headers):
    user = make_user()
    response = client.get(ME, headers=auth_headers(user))
    assert response.status_code == 200
    assert response.get_json()["id"] == user.id


def test_me_requires_a_bearer_token(client):
    response = client.get(ME)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"].startswith("Bearer")
    assert client.get(ME, headers={"Authorization": "Basic abc"}).status_code == 401


def test_deactivation_takes_effect_before_token_expiry(client, session, make_user, auth_headers):
    user = make_user()
    headers = auth_headers(user)
    user.is_active = False
    session.flush()
    response = client.get(ME, headers=headers)
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "account_unavailable"
