"""Checkout phase two: the PaymentIntent is created after the order commits, idempotently."""

import pytest
from sqlalchemy import func, select

from app.extensions import db
from app.models import Order, Payment, PaymentEvent, Product
from app.models.enums import OrderStatus, PaymentEventKind, PaymentStatus
from app.payments import PaymentGatewayError
from tests.realdb import held_locks, make_user, purge_users

CHECKOUT = "/api/v1/checkout"
RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def buyer(make_user, auth_headers):
    return auth_headers(make_user())


def _order(client, headers, product_by_sku):
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    response = client.post(CHECKOUT, json={"address": ADDRESS}, headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_checkout_starts_the_payment(client, session, buyer, product_by_sku, fake_gateway):
    body = _order(client, buyer, product_by_sku)
    assert body["payment"]["client_secret"].endswith("_secret_fake")

    order = session.scalar(select(Order).where(Order.order_number == body["order_number"]))
    name, call = fake_gateway.calls[0]
    assert name == "create_intent"
    assert call == {
        "amount_cents": order.total_cents,
        "currency": "NAD",
        "idempotency_key": f"forge-order-{order.order_number}-intent",
    }
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    assert (payment.status, payment.amount_cents, payment.currency) == (
        PaymentStatus.REQUIRES_PAYMENT,
        order.total_cents,
        "NAD",
    )
    kinds = session.scalars(select(PaymentEvent.kind).where(PaymentEvent.order_id == order.id)).all()
    assert kinds == [PaymentEventKind.INTENT_CREATED]


def test_retrying_returns_the_same_intent_and_records_it_once(client, session, buyer, product_by_sku):
    body = _order(client, buyer, product_by_sku)
    url = f"/api/v1/orders/{body['order_number']}/payment"
    first, second = client.post(url, headers=buyer).get_json(), client.post(url, headers=buyer).get_json()
    assert first["client_secret"] == second["client_secret"] == body["payment"]["client_secret"]
    order_id = session.scalar(select(Order.id).where(Order.order_number == body["order_number"]))
    assert session.scalar(select(func.count()).select_from(Payment).where(Payment.order_id == order_id)) == 1
    assert session.scalar(select(func.count()).select_from(PaymentEvent).where(PaymentEvent.order_id == order_id)) == 1


def test_gateway_outage_keeps_the_order_and_allows_a_retry(client, session, buyer, product_by_sku, fake_gateway):
    fake_gateway.fail_next = PaymentGatewayError("APIConnectionError", retryable=True)
    body = _order(client, buyer, product_by_sku)
    assert body["status"] == "pending_payment" and body["payment"] is None

    fake_gateway.fail_next = PaymentGatewayError("APIConnectionError", retryable=True)
    url = f"/api/v1/orders/{body['order_number']}/payment"
    down = client.post(url, headers=buyer)
    assert down.status_code == 503 and down.get_json()["error"]["code"] == "payment_unavailable"
    assert client.post(url, headers=buyer).get_json()["client_secret"]


def test_only_unpaid_orders_can_start_payment(client, session, buyer, product_by_sku):
    body = _order(client, buyer, product_by_sku)
    order = session.scalar(select(Order).where(Order.order_number == body["order_number"]))
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    payment.status = PaymentStatus.SUCCEEDED
    session.flush()  # the paid guard needs the succeeded payment to exist first
    order.status = OrderStatus.PAID
    session.commit()
    response = client.post(f"/api/v1/orders/{body['order_number']}/payment", headers=buyer)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "order_not_payable"


def test_other_users_orders_are_404(client, buyer, product_by_sku, make_user, auth_headers):
    body = _order(client, buyer, product_by_sku)
    stranger = auth_headers(make_user())
    assert client.post(f"/api/v1/orders/{body['order_number']}/payment", headers=stranger).status_code == 404


def test_no_lock_or_transaction_is_held_during_the_gateway_call(app, fake_gateway):
    """Runs on real commits: at the moment the gateway is called, no session may hold a lock on the
    checkout tables or sit idle inside an open transaction."""
    observed: list = []

    def inspect(_name):
        with db.engine.connect() as watcher:
            observed.extend(held_locks(watcher, ("inventory", "orders", "stock_reservations", "carts", "cart_items")))

    fake_gateway.on_call = inspect
    with app.app_context():
        email, headers = make_user("payment-locks")
        ram = db.session.scalar(select(Product).where(Product.sku == RAM)).id
    try:
        client = app.test_client()
        client.post("/api/v1/cart/items", json={"product_id": ram}, headers=headers)
        response = client.post(CHECKOUT, json={"address": ADDRESS}, headers=headers)
        assert response.status_code == 201
        assert fake_gateway.names() == ["create_intent"]
        assert observed == []
    finally:
        with app.app_context():
            purge_users([email])
