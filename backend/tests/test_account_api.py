"""Account: change the name, change the password (other sessions end, this one stays)."""

import pytest
from sqlalchemy import select

from app.models import RefreshToken
from app.services.mail import outbox
from tests.conftest import DEFAULT_PASSWORD

ME = "/api/v1/auth/me"
NEW_PASSWORD = "a completely new passphrase"


@pytest.fixture(autouse=True)
def empty_outbox(app):
    with app.app_context():
        outbox().clear()


def _login(client, email, password=DEFAULT_PASSWORD):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_update_the_name(client, make_user, auth_headers):
    user = make_user()
    response = client.patch(ME, json={"first_name": "  Ada  ", "last_name": "Lovelace"}, headers=auth_headers(user))
    assert response.status_code == 200
    assert (response.get_json()["first_name"], response.get_json()["last_name"]) == ("Ada", "Lovelace")
    assert client.patch(ME, json={"first_name": ""}, headers=auth_headers(user)).status_code == 422
    assert client.patch(ME, json={"email": "new@example.com"}, headers=auth_headers(user)).status_code == 422


def test_change_password_keeps_this_session_and_ends_the_others(app, client, session, make_user):
    user = make_user(email="changer@example.com")
    other_device = app.test_client()
    _login(other_device, user.email)  # another browser, its own family
    headers = _login(client, user.email)  # this browser: the refresh cookie is in `client`

    response = client.post(
        f"{ME}/password", json={"current_password": DEFAULT_PASSWORD, "new_password": NEW_PASSWORD}, headers=headers
    )
    assert response.status_code == 204, response.get_json()

    live = session.scalars(
        select(RefreshToken.family_id).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ).all()
    assert len(set(live)) == 1  # only this browser's family survives
    assert client.post("/api/v1/auth/refresh").status_code == 200
    assert other_device.post("/api/v1/auth/refresh").status_code == 401
    assert outbox()[-1].subject == "Your Forge password was changed"
    _login(app.test_client(), user.email, NEW_PASSWORD)


def test_the_current_password_must_be_right(client, make_user, auth_headers):
    user = make_user()
    response = client.post(
        f"{ME}/password",
        json={"current_password": "not my password", "new_password": NEW_PASSWORD},
        headers=auth_headers(user),
    )
    assert response.status_code == 400 and response.get_json()["error"]["code"] == "wrong_password"
    assert outbox() == []


def test_the_new_password_follows_the_policy(client, make_user, auth_headers):
    response = client.post(
        f"{ME}/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "short"},
        headers=auth_headers(make_user()),
    )
    assert response.status_code == 422
