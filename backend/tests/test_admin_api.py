"""Administrator endpoints: role enforcement, product updates, and conditional stock edits."""

import pytest
from sqlalchemy import func, select

from app.models import PriceHistory
from app.models.enums import UserRole

SKU = "FRG-CPU-R7-7800X3D"


@pytest.fixture()
def admin(make_user, auth_headers):
    return auth_headers(make_user(role=UserRole.ADMIN))


@pytest.fixture()
def product(product_by_sku):
    return product_by_sku(SKU)


def _product_url(product) -> str:
    return f"/api/v1/admin/products/{product.id}"


# --------------------------------------------------------------------- role enforcement


def test_admin_routes_require_authentication(client, product):
    assert client.patch(_product_url(product), json={"is_active": False}).status_code == 401


def test_customers_are_forbidden(client, product, make_user, auth_headers):
    response = client.patch(_product_url(product), json={"is_active": False}, headers=auth_headers(make_user()))
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"


def test_demoted_admin_loses_access_immediately(client, session, product, make_user, auth_headers):
    user = make_user(role=UserRole.ADMIN)
    headers = auth_headers(user)  # token still claims admin
    user.role = UserRole.CUSTOMER
    session.flush()
    assert client.patch(_product_url(product), json={"is_active": False}, headers=headers).status_code == 403


# --------------------------------------------------------------------- products


def test_price_change_is_recorded_in_price_history(client, session, admin, product):
    new_price = product.price_cents + 1_000
    before = session.scalar(select(func.count()).select_from(PriceHistory).where(PriceHistory.product_id == product.id))

    response = client.patch(_product_url(product), json={"price_cents": new_price}, headers=admin)

    assert response.status_code == 200
    assert response.get_json()["price_cents"] == new_price
    history = session.scalars(
        select(PriceHistory).where(PriceHistory.product_id == product.id).order_by(PriceHistory.id)
    ).all()
    assert len(history) == before + 1
    assert history[-1].price_cents == new_price


def test_deactivate_product(client, admin, product):
    response = client.patch(_product_url(product), json={"is_active": False}, headers=admin)
    assert response.status_code == 200
    assert response.get_json()["is_active"] is False


@pytest.mark.parametrize(
    "body",
    [{}, {"price_cents": -1}, {"price_cents": 10.0}, {"price_cents": "1000"}, {"price_cents": None}, {"name": "x"}],
    ids=["empty", "negative", "float", "string", "null", "unknown-field"],
)
def test_invalid_product_updates_are_422(client, admin, product, body):
    response = client.patch(_product_url(product), json=body, headers=admin)
    assert response.status_code == 422
    assert response.get_json()["error"]["code"] == "validation_failed"


def test_unknown_product_is_404(client, admin):
    assert client.patch("/api/v1/admin/products/999999", json={"is_active": False}, headers=admin).status_code == 404
