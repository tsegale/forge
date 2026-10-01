"""Every failure path produces the same error envelope, and database rule violations
map to precise HTTP errors through their constraint names."""

import psycopg
import pytest
from flask import Blueprint, request
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.exc import OperationalError

from app import create_app
from app.api.spec import api
from app.db_errors import map_database_error
from app.errors import Conflict
from app.extensions import db
from app.models import Build, BuildItem, Product, User


class ProbeBody(BaseModel):
    name: str = Field(min_length=1)
    quantity: int = Field(gt=0)


probe = Blueprint("error_probe", __name__)


@probe.get("/api-error")
def raise_api_error():
    raise Conflict("Already done.", code="already_done", details={"hint": "x"})


@probe.post("/validated")
@api.validate(json=ProbeBody)
def validated():
    return {"name": request.context.json.name}


@probe.get("/boom")
def boom():
    raise RuntimeError("secret internal detail")


@probe.post("/duplicate-email")
def duplicate_email():
    for email in ("dup@example.com", "DUP@example.com"):
        db.session.add(User(email=email, password_hash="x", first_name="A", last_name="B"))
        db.session.flush()
    return {}


@probe.post("/second-cpu")
def second_cpu():
    user = User(email="cpu@example.com", password_hash="x", first_name="A", last_name="B")
    db.session.add(user)
    db.session.flush()
    build = Build(user_id=user.id, name="Two CPUs")
    for sku in ("FRG-CPU-R7-7800X3D", "FRG-CPU-R5-7600X"):
        build.items.append(BuildItem.for_product(db.session.scalar(select(Product).where(Product.sku == sku))))
        db.session.add(build)
        db.session.flush()
    return {}


@probe.post("/unmapped-check")
def unmapped_check():
    db.session.execute(text("UPDATE component_kinds SET max_per_build = 0 WHERE code = 'cpu'"))
    return {}


@probe.post("/append-only")
def append_only():
    db.session.execute(text("UPDATE price_history SET price_cents = 1"))
    return {}


@pytest.fixture(scope="module")
def client(app):
    """A separate app instance so probe routes never leak into the real API."""
    probe_app = create_app("testing")
    probe_app.register_blueprint(probe, url_prefix="/_probe")
    return probe_app.test_client()


def _error(response):
    body = response.get_json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details", "request_id"}
    assert body["error"]["request_id"] == response.headers["X-Request-ID"]
    return body["error"]


def test_api_error_uses_envelope(client):
    response = client.get("/_probe/api-error")
    assert response.status_code == 409
    err = _error(response)
    assert err["code"] == "already_done"
    assert err["details"] == {"hint": "x"}


def test_unknown_route_is_404_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert _error(response)["code"] == "not_found"


def test_wrong_method_is_405_and_keeps_allow_header(client):
    response = client.delete("/api/v1/health/live")
    assert response.status_code == 405
    assert _error(response)["code"] == "method_not_allowed"
    assert "GET" in response.headers["Allow"]


def test_request_validation_is_422_with_field_details(client):
    response = client.post("/_probe/validated", json={"name": "", "quantity": 0})
    assert response.status_code == 422
    err = _error(response)
    assert err["code"] == "validation_failed"
    assert {d["field"] for d in err["details"]} == {"name", "quantity"}


def test_valid_request_reaches_view(client):
    response = client.post("/_probe/validated", json={"name": "ok", "quantity": 1})
    assert response.status_code == 200
    assert response.get_json() == {"name": "ok"}


def test_unexpected_error_is_500_without_leaking_internals(client):
    response = client.get("/_probe/boom")
    assert response.status_code == 500
    err = _error(response)
    assert err["code"] == "internal_error"
    assert "secret" not in response.get_data(as_text=True)


def test_incoming_request_id_is_echoed(client):
    response = client.get("/_probe/api-error", headers={"X-Request-ID": "trace-abc.123"})
    assert _error(response)["request_id"] == "trace-abc.123"


def test_malformed_request_id_is_replaced(client):
    response = client.get("/_probe/api-error", headers={"X-Request-ID": "bad id <script>"})
    assert _error(response)["request_id"] != "bad id <script>"


@pytest.mark.parametrize(
    ("path", "status", "code"),
    [
        ("/_probe/duplicate-email", 409, "email_taken"),  # CITEXT unique, differing only in case
        ("/_probe/second-cpu", 409, "build_slot_limit"),  # raised by a constraint trigger
        ("/_probe/unmapped-check", 422, "constraint_violation"),  # SQLSTATE fallback
        ("/_probe/append-only", 409, "invalid_state"),  # append-only audit trigger
    ],
)
def test_database_rules_map_to_http_errors(client, session, path, status, code):
    response = client.post(path)
    assert response.status_code == status
    assert _error(response)["code"] == code


def test_unreachable_database_maps_to_503():
    # Connection failures carry no SQLSTATE; build one directly rather than wait on a socket timeout.
    exc = OperationalError("SELECT 1", {}, psycopg.OperationalError("connection refused"))
    assert map_database_error(exc).status == 503
