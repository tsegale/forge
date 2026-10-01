"""Customer orders: listing, detail with history, and cancelling an unpaid order."""

import pytest
from sqlalchemy import select

from app.models import Order, OrderStatusHistory, Payment
from app.models.enums import OrderStatus, PaymentStatus

ORDERS = "/api/v1/orders"
RAM, SSD = "FRG-RAM-CR-VEN-32-6000", "FRG-SSD-WD-SN850X-1TB"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def buyer(make_user, auth_headers):
    user = make_user()
    return user, auth_headers(user)


def _place(client, headers, product, quantity=1):
    client.post("/api/v1/cart/items", json={"product_id": product.id, "quantity": quantity}, headers=headers)
    response = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["order_number"]


def test_list_is_newest_first_and_paginates(client, buyer, product_by_sku):
    numbers = [_place(client, buyer[1], product_by_sku(RAM)) for _ in range(3)]
    first = client.get(f"{ORDERS}?limit=2", headers=buyer[1]).get_json()
    assert [o["order_number"] for o in first["items"]] == numbers[::-1][:2]
    rest = client.get(f"{ORDERS}?limit=2&cursor={first['next_cursor']}", headers=buyer[1]).get_json()
    assert [o["order_number"] for o in rest["items"]] == [numbers[0]] and rest["next_cursor"] is None


def test_list_shows_only_my_orders_and_filters_by_status(client, buyer, product_by_sku, make_user, auth_headers):
    mine = _place(client, buyer[1], product_by_sku(RAM))
    _place(client, auth_headers(make_user()), product_by_sku(SSD))
    listed = client.get(ORDERS, headers=buyer[1]).get_json()["items"]
    assert [o["order_number"] for o in listed] == [mine]
    assert client.get(f"{ORDERS}?status=paid", headers=buyer[1]).get_json()["items"] == []


def test_detail_includes_history_and_payment_status(client, buyer, product_by_sku):
    number = _place(client, buyer[1], product_by_sku(RAM), 2)
    body = client.get(f"{ORDERS}/{number}", headers=buyer[1]).get_json()
    assert body["payment_status"] == "requires_payment"
    assert [(h["from_status"], h["to_status"]) for h in body["history"]] == [(None, "pending_payment")]
    assert body["items"][0]["quantity"] == 2


def test_other_users_orders_are_404(client, buyer, product_by_sku, make_user, auth_headers):
    number = _place(client, buyer[1], product_by_sku(RAM))
    stranger = auth_headers(make_user())
    assert client.get(f"{ORDERS}/{number}", headers=stranger).status_code == 404
    assert client.post(f"{ORDERS}/{number}/cancel", headers=stranger).status_code == 404


def test_cancelling_releases_stock_then_stops_the_payment(client, session, buyer, product_by_sku, fake_gateway):
    user, headers = buyer
    ram = product_by_sku(RAM)
    session.expire(ram.inventory)
    reserved_before = ram.inventory.quantity_reserved
    number = _place(client, headers, ram, 2)

    response = client.post(f"{ORDERS}/{number}/cancel", headers=headers)

    assert response.status_code == 200 and response.get_json()["status"] == "cancelled"
    session.expire(ram.inventory)
    assert ram.inventory.quantity_reserved == reserved_before
    intent = session.scalar(select(Payment.provider_payment_id).join(Order).where(Order.order_number == number))
    assert fake_gateway.calls[-1] == (
        "cancel_intent",
        {"intent_id": intent, "idempotency_key": f"forge-order-{number}-cancel-{intent}"},
    )
    order = session.scalar(select(Order).where(Order.order_number == number))
    cancelled = session.scalars(
        select(OrderStatusHistory).where(
            OrderStatusHistory.order_id == order.id, OrderStatusHistory.to_status == OrderStatus.CANCELLED
        )
    ).one()
    assert cancelled.changed_by_user_id == user.id


def test_only_unpaid_orders_can_be_cancelled(client, session, buyer, product_by_sku):
    number = _place(client, buyer[1], product_by_sku(RAM))
    order = session.scalar(select(Order).where(Order.order_number == number))
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    payment.status = PaymentStatus.SUCCEEDED
    session.flush()
    order.status = OrderStatus.PAID
    session.commit()
    response = client.post(f"{ORDERS}/{number}/cancel", headers=buyer[1])
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "order_not_cancellable"


def test_orders_require_authentication(client):
    assert client.get(ORDERS).status_code == 401
