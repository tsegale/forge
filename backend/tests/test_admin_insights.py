"""Back office: sales metrics, the webhook ledger, and one audit trail over the database's logs."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, update

from app.models import Inventory, Order, Payment, Product
from app.models.enums import OrderStatus, UserRole
from app.services.audit import set_actor
from tests.stripe_helpers import event, payment_intent, sign

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def admin(make_user, auth_headers):
    user = make_user(role=UserRole.ADMIN)
    user.first_name, user.last_name = "Dana", "Admin"
    return user, auth_headers(user)


@pytest.fixture()
def paid_order(client, session, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user())
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id, "quantity": 2}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    order = session.scalar(select(Order).where(Order.order_number == number))
    intent = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
    body = event(
        "payment_intent.succeeded",
        payment_intent(intent, order.total_cents, metadata={"order_number": number}),
    )
    assert (
        client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)}).status_code == 200
    )
    session.refresh(order)
    assert order.status is OrderStatus.PAID
    return order


def test_metrics_count_paid_orders_and_fill_every_day(client, session, admin, paid_order):
    body = client.get("/api/v1/admin/metrics?days=7", headers=admin[1]).get_json()
    assert body["orders"] >= 1 and body["revenue"]["amount_cents"] >= paid_order.total_cents
    assert body["units"] >= 2
    assert len(body["daily"]) == 7 and body["daily"][-1]["orders"] >= 1
    assert sum(d["revenue"]["amount_cents"] for d in body["daily"]) == body["revenue"]["amount_cents"]
    assert RAM in [p["sku"] for p in body["top_products"]]
    assert {s["status"]: s["count"] for s in body["by_status"]}["paid"] >= 1


def test_unpaid_orders_are_awaiting_not_revenue(client, session, admin, make_user, auth_headers, product_by_sku):
    before = client.get("/api/v1/admin/metrics", headers=admin[1]).get_json()
    headers = auth_headers(make_user())
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    assert client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).status_code == 201
    after = client.get("/api/v1/admin/metrics", headers=admin[1]).get_json()
    assert after["awaiting_payment"] == before["awaiting_payment"] + 1
    assert after["revenue"] == before["revenue"]


def test_low_stock_lists_products_with_three_or_fewer(client, session, admin, product_by_sku):
    ram = product_by_sku(RAM)
    session.execute(update(Inventory).where(Inventory.product_id == ram.id).values(quantity_on_hand=2))
    low = client.get("/api/v1/admin/metrics", headers=admin[1]).get_json()["low_stock"]
    assert {"product_id": ram.id, "sku": RAM, "name": ram.name, "available": 2} in low


def test_webhook_log_shows_the_event_and_its_order(client, admin, paid_order):
    items = client.get("/api/v1/admin/webhooks", headers=admin[1]).get_json()["items"]
    assert items[0]["event_type"] == "payment_intent.succeeded"
    assert items[0]["order_number"] == paid_order.order_number


def test_audit_trail_merges_every_log_with_who_did_it(client, session, admin, paid_order, product_by_sku):
    ram = product_by_sku(RAM)
    set_actor(session, admin[0].id)
    session.execute(update(Inventory).where(Inventory.product_id == ram.id).values(quantity_on_hand=40))
    session.execute(update(Product).where(Product.id == ram.id).values(price_cents=ram.price_cents - 10_000))
    items = client.get("/api/v1/admin/audit?limit=200", headers=admin[1]).get_json()["items"]
    kinds = {i["kind"] for i in items}
    assert {"orders", "stock", "prices", "payments"} <= kinds
    times = [datetime.fromisoformat(i["at"]) for i in items]
    assert times == sorted(times, reverse=True)
    stock = next(i for i in items if i["kind"] == "stock" and i["subject"] == RAM and i["actor"])
    assert stock["actor"] == "Dana Admin" and "on hand" in stock["summary"].lower()
    paid = next(i for i in items if i["kind"] == "orders" and i["subject"] == paid_order.order_number)
    assert "paid" in paid["summary"].lower()


def test_audit_filters_by_kind_and_pages_by_time(client, admin, paid_order):
    only = client.get("/api/v1/admin/audit?kind=payments&limit=1", headers=admin[1]).get_json()
    assert [i["kind"] for i in only["items"]] == ["payments"]
    if only["next_before"]:
        older = client.get(
            f"/api/v1/admin/audit?kind=payments&limit=1&before={only['next_before']}", headers=admin[1]
        ).get_json()
        assert all(
            datetime.fromisoformat(i["at"]) < datetime.fromisoformat(only["next_before"]) for i in older["items"]
        )
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat().replace("+00:00", "Z")
    assert client.get(f"/api/v1/admin/audit?before={future}", headers=admin[1]).status_code == 200


@pytest.mark.parametrize("path", ["/api/v1/admin/metrics", "/api/v1/admin/webhooks", "/api/v1/admin/audit"])
def test_admin_only(client, make_user, auth_headers, path):
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth_headers(make_user())).status_code == 403
