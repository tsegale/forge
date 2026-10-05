"""Reference data and runtime configuration for the frontend, and the admin product list."""

import pytest

from app.config import DevelopmentConfig, ProductionConfig
from app.models.enums import UserRole


def test_component_kinds_in_display_order(client):
    items = client.get("/api/v1/component-kinds").get_json()["items"]
    assert [k["code"] for k in items][:3] == ["cpu", "motherboard", "memory"]
    memory = next(k for k in items if k["code"] == "memory")
    assert memory == {
        "code": "memory",
        "label": "Memory kit",
        "max_per_build": 4,
        "required_in_build": True,
        "sort_order": 30,
    }


def test_public_config(client):
    body = client.get("/api/v1/config").get_json()
    assert body == {
        "currency": "nad",
        "vat_rate_bps": 1500,
        "shipping": {"flat_cents": 15_000, "free_threshold_cents": 500_000},
        "reservation_ttl_seconds": 900,
        "payment_provider": "fake",
        "stripe_publishable_key": None,  # not configured in tests
    }


@pytest.fixture()
def env(monkeypatch):
    for name in ("PAYMENT_GATEWAY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PUBLISHABLE_KEY"):
        monkeypatch.delenv(name, raising=False)
    return monkeypatch


def test_publishable_key_is_validated(env):
    env.setenv("STRIPE_PUBLISHABLE_KEY", "sk_test_oops")
    with pytest.raises(RuntimeError, match="not a Stripe publishable key"):
        DevelopmentConfig()
    env.setenv("STRIPE_PUBLISHABLE_KEY", "pk_live_abc")
    with pytest.raises(RuntimeError, match="live Stripe key"):
        DevelopmentConfig()
    env.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_abc")
    assert DevelopmentConfig().STRIPE_PUBLISHABLE_KEY == "pk_test_abc"


def test_production_requires_a_publishable_key(env):
    env.setenv("MAIL_SERVER", "smtp.example.com")
    env.setenv("STRIPE_SECRET_KEY", "sk_live_abc")
    env.setenv("STRIPE_WEBHOOK_SECRET", "whsec_abc")
    with pytest.raises(RuntimeError, match="STRIPE_PUBLISHABLE_KEY"):
        ProductionConfig()


# --------------------------------------------------------------------- admin product list


@pytest.fixture()
def admin(make_user, auth_headers):
    return auth_headers(make_user(role=UserRole.ADMIN))


def test_admin_product_list_includes_stock_and_inactive_products(client, session, admin, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-7800X3D")
    product.is_active = False
    session.flush()
    rows = client.get("/api/v1/admin/products?kind=cpu&limit=100", headers=admin).get_json()["items"]
    row = next(r for r in rows if r["sku"] == "FRG-CPU-R7-7800X3D")
    assert row["is_active"] is False
    assert row["quantity_available"] == row["quantity_on_hand"] - row["quantity_reserved"]
    assert row["version"] == product.inventory.version


def test_admin_product_list_filters_and_pages(client, admin):
    found = client.get("/api/v1/admin/products?q=x3d", headers=admin).get_json()["items"]
    assert {r["sku"] for r in found} == {"FRG-CPU-R7-7800X3D", "FRG-CPU-R7-9800X3D", "FRG-CPU-R7-5800X3D"}
    first = client.get("/api/v1/admin/products?limit=10", headers=admin).get_json()
    second = client.get(f"/api/v1/admin/products?limit=10&cursor={first['next_cursor']}", headers=admin).get_json()
    assert not {r["id"] for r in first["items"]} & {r["id"] for r in second["items"]}


def test_admin_product_list_is_admin_only(client, make_user, auth_headers):
    assert client.get("/api/v1/admin/products", headers=auth_headers(make_user())).status_code == 403
