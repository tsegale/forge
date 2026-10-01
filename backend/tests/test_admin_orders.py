"""Admin order operations: fulfilment transitions and refunds, audited with the acting admin."""

import pytest
from sqlalchemy import select

from app.models import Order, OrderStatusHistory, Payment, PaymentEvent
from app.models.enums import OrderStatus, PaymentEventKind, PaymentStatus, UserRole
from app.payments import PaymentGatewayError
from tests.stripe_helpers import event, payment_intent, sign

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def admin(make_user, auth_headers):
    user = make_user(role=UserRole.ADMIN)
    return user, auth_headers(user)


@pytest.fixture()
def paid_order(client, session, make_user, auth_headers, product_by_sku):
    """Paid through the real flow: checkout, then a signed payment_intent.succeeded webhook."""
    headers = auth_headers(make_user(email="customer@example.com"))
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    order = session.scalar(select(Order).where(Order.order_number == number))
    intent = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
    body = event("payment_intent.succeeded", payment_intent(intent, order.total_cents))
    assert (
        client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)}).status_code == 200
    )
    session.refresh(order)
    assert order.status is OrderStatus.PAID
    return order


def _advance(client, headers, order, to):
    return client.post(f"/api/v1/admin/orders/{order.order_number}/status", json={"to": to}, headers=headers)


def _refund(client, headers, order, **body):
    return client.post(f"/api/v1/admin/orders/{order.order_number}/refund", json=body, headers=headers)


def _history(session, order):
    return session.scalars(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id).order_by(OrderStatusHistory.id)
    ).all()


def test_admin_routes_are_admin_only(client, paid_order, make_user, auth_headers):
    customer = auth_headers(make_user())
    assert client.get("/api/v1/admin/orders", headers=customer).status_code == 403
    assert _advance(client, customer, paid_order, "fulfilling").status_code == 403
    assert _refund(client, customer, paid_order).status_code == 403


def test_admin_sees_any_order_with_the_customer(client, admin, paid_order):
    body = client.get(f"/api/v1/admin/orders/{paid_order.order_number}", headers=admin[1]).get_json()
    assert body["customer_email"] == "customer@example.com" and body["status"] == "paid"
    listed = client.get("/api/v1/admin/orders?status=paid", headers=admin[1]).get_json()["items"]
    assert paid_order.order_number in [o["order_number"] for o in listed]


def test_fulfilment_is_audited_with_the_admin(client, session, admin, paid_order):
    for step in ("fulfilling", "shipped", "delivered"):
        response = _advance(client, admin[1], paid_order, step)
        assert response.status_code == 200 and response.get_json()["status"] == step
    steps = [(h.to_status, h.changed_by_user_id) for h in _history(session, paid_order)][-3:]
    assert steps == [
        (OrderStatus.FULFILLING, admin[0].id),
        (OrderStatus.SHIPPED, admin[0].id),
        (OrderStatus.DELIVERED, admin[0].id),
    ]


def test_illegal_jumps_are_rejected_by_the_database(client, admin, paid_order):
    response = _advance(client, admin[1], paid_order, "delivered")  # paid -> delivered skips shipping
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "invalid_status_transition"


def test_status_endpoint_only_accepts_fulfilment_steps(client, admin, paid_order):
    assert _advance(client, admin[1], paid_order, "refunded").status_code == 422
    assert _advance(client, admin[1], paid_order, "paid").status_code == 422


def test_refund_goes_through_stripe_and_is_recorded(client, session, admin, paid_order, fake_gateway):
    response = _refund(client, admin[1], paid_order, reason="Customer changed their mind")

    assert response.status_code == 200 and response.get_json()["status"] == "refunded"
    payment = session.scalar(select(Payment).where(Payment.order_id == paid_order.id))
    session.refresh(payment)
    assert payment.status is PaymentStatus.REFUNDED
    name, call = fake_gateway.calls[-1]
    assert name == "refund" and call["idempotency_key"] == f"forge-order-{paid_order.order_number}-refund"
    assert call["amount_cents"] == paid_order.total_cents
    events = session.scalars(
        select(PaymentEvent).where(PaymentEvent.order_id == paid_order.id).order_by(PaymentEvent.id)
    ).all()
    assert [e.kind for e in events][-2:] == [PaymentEventKind.REFUND_REQUESTED, PaymentEventKind.REFUNDED]
    assert events[-2].details == {"reason": "Customer changed their mind"}
    assert {e.actor_user_id for e in events[-2:]} == {admin[0].id}
    assert _history(session, paid_order)[-1].changed_by_user_id == admin[0].id


def test_shipped_orders_cannot_be_refunded_and_no_money_moves(client, admin, paid_order, fake_gateway):
    _advance(client, admin[1], paid_order, "fulfilling")
    _advance(client, admin[1], paid_order, "shipped")
    response = _refund(client, admin[1], paid_order)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "refund_not_allowed"
    assert "refund" not in fake_gateway.names()


def test_failed_refund_is_502_and_leaves_the_order_paid(client, session, admin, paid_order, fake_gateway):
    def fail(name):
        if name == "refund":
            raise PaymentGatewayError("APIError", retryable=True)

    fake_gateway.on_call = fail
    response = _refund(client, admin[1], paid_order)
    assert response.status_code == 502 and response.get_json()["error"]["code"] == "refund_failed"
    session.refresh(paid_order)
    assert paid_order.status is OrderStatus.PAID
    kinds = session.scalars(
        select(PaymentEvent.kind).where(PaymentEvent.order_id == paid_order.id).order_by(PaymentEvent.id)
    ).all()
    assert kinds[-2:] == [PaymentEventKind.REFUND_REQUESTED, PaymentEventKind.REFUND_FAILED]


def test_unpaid_orders_have_nothing_to_refund(client, session, admin, make_user, auth_headers, product_by_sku):
    headers = auth_headers(make_user())
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    client.post(f"/api/v1/orders/{number}/cancel", headers=headers)
    order = session.scalar(select(Order).where(Order.order_number == number))
    response = _refund(client, admin[1], order)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "nothing_to_refund"
