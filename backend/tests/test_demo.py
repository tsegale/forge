"""flask seed demo: an idempotent reset that gives every demo screen data."""

import json
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.cli import DEFAULT_SEED
from app.demo import ADMIN, CUSTOMER, DEMO_BUILD, FEATURED_BUILDS, PAST_ORDERS, RESTOCKED, REVIEWS, reset
from app.models import (
    Build,
    Inventory,
    Order,
    OrderStatusHistory,
    Payment,
    PriceHistory,
    Product,
    Review,
    StockReservation,
    User,
)
from app.models.enums import BuildStatus, OrderStatus, PaymentStatus, ReservationStatus

EXPECTED_STATUSES = sorted(status.value for _, status, _ in PAST_ORDERS)


@pytest.fixture()
def demo(app, session):
    reset()
    return session


def _state(session):
    statuses = sorted(o.status.value for o in session.scalars(select(Order)))
    stock = dict(session.execute(select(Inventory.product_id, Inventory.quantity_on_hand)).all())
    return statuses, stock, session.scalar(select(func.count()).select_from(User))


def test_reset_is_idempotent(app, demo):
    first = _state(demo)
    reset()
    assert _state(demo) == first
    assert first[0] == EXPECTED_STATUSES


def test_stock_is_seed_stock_minus_past_sales(demo):
    seed = {p["sku"]: p["stock"] for p in json.loads(DEFAULT_SEED.read_text(encoding="utf-8"))["products"]}
    sold: dict[str, int] = {}
    for lines, _, _ in PAST_ORDERS:
        for sku, qty in lines:
            sold[sku] = sold.get(sku, 0) + qty
    for product in demo.scalars(select(Product)):
        inventory = demo.get(Inventory, product.id)
        assert inventory.quantity_reserved == 0
        assert inventory.quantity_on_hand == seed[product.sku] - sold.get(product.sku, 0), product.sku
    active = demo.scalar(
        select(func.count()).select_from(StockReservation).where(StockReservation.status == ReservationStatus.ACTIVE)
    )
    assert active == 0


def test_demo_accounts_can_sign_in(client, demo):
    for account in (ADMIN, CUSTOMER):
        response = client.post("/api/v1/auth/login", json={"email": account.email, "password": account.password})
        assert response.status_code == 200, account.email
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {response.get_json()['access_token']}"})
    assert me.get_json()["role"] == "customer"


def test_fulfilment_history_is_attributed_to_the_admin(demo):
    admin_id = demo.scalar(select(User.id).where(User.email == ADMIN.email))
    delivered = demo.scalar(select(Order).where(Order.status == OrderStatus.DELIVERED))
    steps = demo.scalars(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == delivered.id).order_by(OrderStatusHistory.id)
    ).all()
    assert [s.to_status for s in steps] == [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.PAID,
        OrderStatus.FULFILLING,
        OrderStatus.SHIPPED,
        OrderStatus.DELIVERED,
    ]
    assert {s.changed_by_user_id for s in steps[2:]} == {admin_id}
    refunded = demo.scalar(select(Order).where(Order.status == OrderStatus.REFUNDED))
    assert demo.scalar(select(Payment.status).where(Payment.order_id == refunded.id)) is PaymentStatus.REFUNDED


def test_demo_build_really_is_compatible_and_complete(client, demo):
    """The reset marks it validated; prove that by running the engine through the API."""
    customer_id = demo.scalar(select(User.id).where(User.email == CUSTOMER.email))
    build = demo.scalar(select(Build).where(Build.user_id == customer_id))
    assert build.status is BuildStatus.VALIDATED and len(build.items) == len(DEMO_BUILD)
    login = client.post("/api/v1/auth/login", json={"email": CUSTOMER.email, "password": CUSTOMER.password}).get_json()
    report = client.post(
        f"/api/v1/builds/{build.id}/validate", headers={"Authorization": f"Bearer {login['access_token']}"}
    ).get_json()
    assert report["status"] == "validated" and report["compatible"] and report["complete"]


def test_production_requires_confirmation(app, demo, monkeypatch):
    monkeypatch.setitem(app.config, "FORGE_ENV_NAME", "production")
    result = app.test_cli_runner().invoke(args=["seed", "demo"])
    assert result.exit_code != 0 and "--yes" in result.output


def test_price_history_ends_at_the_current_price_and_some_parts_just_dropped(client, demo):
    drops = 0
    for product in demo.scalars(select(Product)):
        rows = demo.execute(
            select(PriceHistory.recorded_at, PriceHistory.price_cents)
            .where(PriceHistory.product_id == product.id)
            .order_by(PriceHistory.recorded_at)
        ).all()
        assert len(rows) >= 3, product.sku
        assert rows[-1].price_cents == product.price_cents, product.sku
        recent = rows[-1].recorded_at > datetime.now(UTC) - timedelta(days=14)
        drops += recent and rows[-2].price_cents > rows[-1].price_cents
    assert drops >= 10


def test_reviews_mix_verified_and_unverified(demo):
    reviews = demo.scalars(select(Review)).all()
    assert len(reviews) == len(REVIEWS)
    customer = demo.scalar(select(User.id).where(User.email == CUSTOMER.email))
    verified = {r.product_id for r in reviews if r.is_verified_purchase}
    bought = {r.product_id for r in reviews if r.user_id == customer}
    refunded = demo.scalar(select(Product.id).where(Product.sku == "FRG-PSU-CR-RM850E"))
    assert verified and verified <= bought  # only the customer bought anything
    assert refunded not in verified


def test_featured_builds_are_validated_by_the_engine(client, demo):
    items = client.get("/api/v1/builds/featured").get_json()["items"]
    assert [b["share_slug"] for b in items] == [slug for slug, *_ in FEATURED_BUILDS]
    for build in items:
        ids = [(line["product"]["id"], line["quantity"]) for line in build["items"]]
        report = client.post(
            "/api/v1/compatibility/check", json={"items": [{"product_id": i, "quantity": q} for i, q in ids]}
        ).get_json()
        assert report["compatible"] and report["complete"], (
            build["name"],
            report["conflicts"],
            report["missing_kinds"],
        )


def test_the_reset_leaves_parts_back_in_stock(client, demo):
    restocked = {i["product"]["sku"] for i in client.get("/api/v1/products/back-in-stock?limit=24").get_json()["items"]}
    assert set(RESTOCKED) <= restocked
