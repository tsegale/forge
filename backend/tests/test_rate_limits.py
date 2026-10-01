"""Login and registration rate limits, enforced through the same Redis storage production uses."""

import pytest
from limits.storage import RedisStorage

from app import create_app
from app.extensions import limiter
from tests.conftest import DEFAULT_PASSWORD

LOGIN = "/api/v1/auth/login"
REGISTER = "/api/v1/auth/register"


def _login(client, email, password="wrong password", ip="203.0.113.10"):
    return client.post(LOGIN, json={"email": email, "password": password}, environ_base={"REMOTE_ADDR": ip})


def test_limits_are_stored_in_redis(app):
    with app.app_context():
        assert isinstance(limiter.storage, RedisStorage)


def test_sixth_login_attempt_from_one_ip_is_429(client, make_user):
    make_user(email="target@example.com")
    for attempt in range(5):
        assert _login(client, f"guess{attempt}@example.com").status_code == 401
    response = _login(client, "guess5@example.com")
    assert response.status_code == 429
    assert response.get_json()["error"]["code"] == "too_many_requests"
    assert response.get_json()["error"]["message"] == "Too many sign-in attempts. Wait a moment and try again."
    assert int(response.headers["Retry-After"]) > 0


def test_other_ips_are_unaffected(client):
    for _ in range(6):
        _login(client, "someone@example.com", ip="203.0.113.10")
    assert _login(client, "other@example.com", ip="198.51.100.7").status_code == 401


def test_account_is_protected_across_ips(client, make_user):
    """A distributed attack rotates IPs; the per-account limit still trips after 10 failures."""
    make_user(email="victim@example.com")
    for attempt in range(10):
        assert _login(client, "Victim@Example.com", ip=f"198.51.100.{attempt}").status_code == 401
    assert _login(client, "victim@example.com", ip="192.0.2.99").status_code == 429


def test_successful_logins_do_not_consume_the_account_limit(client, make_user):
    make_user(email="regular@example.com")
    for attempt in range(12):  # different IPs, so only the per-account limit applies
        ok = _login(client, "regular@example.com", password=DEFAULT_PASSWORD, ip=f"198.51.100.{attempt}")
        assert ok.status_code == 200


def test_registration_is_limited_per_ip(client):
    for n in range(10):
        body = {"email": f"bot{n}@example.com", "password": "x" * 12, "first_name": "B", "last_name": "B"}
        assert client.post(REGISTER, json=body).status_code == 201
    body = {"email": "bot10@example.com", "password": "x" * 12, "first_name": "B", "last_name": "B"}
    assert client.post(REGISTER, json=body).status_code == 429


@pytest.fixture()
def proxied_client(monkeypatch, session):
    monkeypatch.setenv("TRUSTED_PROXY_COUNT", "1")
    proxied = create_app("testing")
    with proxied.app_context():
        limiter.reset()
    return proxied.test_client()


def test_behind_a_proxy_clients_are_told_apart_by_forwarded_address(proxied_client):
    nginx = {"REMOTE_ADDR": "172.18.0.5"}

    def attempt(forwarded_for):
        return proxied_client.post(
            LOGIN,
            json={"email": "x@example.com", "password": "wrong password"},
            headers={"X-Forwarded-For": forwarded_for},
            environ_base=nginx,
        )

    for _ in range(5):
        attempt("203.0.113.10")
    assert attempt("203.0.113.10").status_code == 429
    # A different client behind the same proxy is not locked out...
    assert attempt("198.51.100.7").status_code == 401
    # ...and a spoofed left-most entry does not change the address nginx appended.
    assert attempt("198.51.100.7, 203.0.113.10").status_code == 429
