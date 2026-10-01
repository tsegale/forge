"""A payment that succeeds after the reservation expired and the order was cancelled."""

import pytest
from sqlalchemy import select

from app.models import Build, BuildItem, Order, Payment, PaymentEvent, StockReservation
from app.models.enums import (
    BuildStatus,
    OrderStatus,
    PaymentEventKind,
    PaymentStatus,
    ReservationStatus,
)
from app.payments import PaymentGatewayError
from app.services.stock import resolve_reservations
from tests.stripe_helpers import event, payment_intent, sign

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def buyer(make_user, auth_headers):
    return auth_headers(make_user())


def _checkout(client, headers, body):
    response = client.post("/api/v1/checkout", json={"address": ADDRESS} | body, headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["order_number"]


@pytest.fixture()
def cancelled(client, session, buyer, product_by_sku):
    """An order for 2 units whose hold expired and which was cancelled (what the sweeper does)."""
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id, "quantity": 2}, headers=buyer)
    order = session.scalar(select(Order).where(Order.order_number == _checkout(client, buyer, {})))
    return _expire_and_cancel(session, order)


def _expire_and_cancel(session, order):
    resolve_reservations(order.id, (ReservationStatus.ACTIVE,), ReservationStatus.EXPIRED)
    order.status = OrderStatus.CANCELLED
    session.commit()
    return order


def _pay_late(client, session, order, event_id=None):
    intent_id = session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))
    body = event("payment_intent.succeeded", payment_intent(intent_id, order.total_cents), event_id=event_id)
    response = client.post("/api/v1/webhooks/stripe", data=body, headers={"Stripe-Signature": sign(body)})
    assert response.status_code == 200, response.get_json()
    session.expire_all()
    return response


def _kinds(session, order):
    return session.scalars(
        select(PaymentEvent.kind).where(PaymentEvent.order_id == order.id).order_by(PaymentEvent.id)
    ).all()[1:]


def _stock(session, product):
    session.expire(product.inventory)
    return product.inventory.quantity_on_hand, product.inventory.quantity_reserved


def test_stock_still_there_means_the_order_is_paid_after_all(client, session, cancelled, product_by_sku, fake_gateway):
    ram = product_by_sku(RAM)
    on_hand, reserved = _stock(session, ram)

    _pay_late(client, session, cancelled)

    assert cancelled.status is OrderStatus.PAID
    assert _stock(session, ram) == (on_hand - 2, reserved)  # taken straight from stock on hand
    statuses = session.scalars(select(StockReservation.status).where(StockReservation.order_id == cancelled.id)).all()
    assert statuses == [ReservationStatus.COMMITTED]
    assert _kinds(session, cancelled) == [PaymentEventKind.LATE_PAYMENT_RESERVED]
    assert "refund" not in fake_gateway.names()


def test_stock_gone_means_an_automatic_refund(client, session, cancelled, product_by_sku, fake_gateway):
    ram = product_by_sku(RAM)
    ram.inventory.quantity_on_hand, ram.inventory.quantity_reserved = 1, 0  # someone else bought them
    session.commit()

    _pay_late(client, session, cancelled)

    assert cancelled.status is OrderStatus.REFUNDED
    payment = session.scalar(select(Payment).where(Payment.order_id == cancelled.id))
    assert payment.status is PaymentStatus.REFUNDED
    assert _kinds(session, cancelled) == [
        PaymentEventKind.LATE_PAYMENT_REFUND_PENDING,
        PaymentEventKind.LATE_PAYMENT_REFUNDED,
    ]
    pending = session.scalars(select(PaymentEvent).where(PaymentEvent.order_id == cancelled.id)).all()[1]
    assert pending.details["shortfall"] == [{"product_id": ram.id, "needed": 2, "available": 1}]
    name, call = fake_gateway.calls[-1]
    assert name == "refund"
    assert call == {
        "intent_id": payment.provider_payment_id,
        "amount_cents": cancelled.total_cents,
        "idempotency_key": f"forge-order-{cancelled.order_number}-late-refund",
    }
    assert _stock(session, ram) == (1, 0)  # untouched


def test_failed_refund_is_recorded_for_follow_up(client, session, cancelled, product_by_sku, fake_gateway):
    ram = product_by_sku(RAM)
    ram.inventory.quantity_on_hand, ram.inventory.quantity_reserved = 0, 0
    session.commit()

    def fail_refunds(name):
        if name == "refund":
            raise PaymentGatewayError("APIConnectionError", retryable=True)

    fake_gateway.on_call = fail_refunds
    _pay_late(client, session, cancelled)

    assert cancelled.status is OrderStatus.CANCELLED
    assert _kinds(session, cancelled) == [PaymentEventKind.LATE_PAYMENT_REFUND_PENDING, PaymentEventKind.REFUND_FAILED]
    failed = session.scalars(select(PaymentEvent).where(PaymentEvent.order_id == cancelled.id)).all()[-1]
    assert failed.details["retryable"] is True


def test_redelivered_late_payment_does_not_refund_twice(client, session, cancelled, product_by_sku, fake_gateway):
    ram = product_by_sku(RAM)
    ram.inventory.quantity_on_hand, ram.inventory.quantity_reserved = 0, 0
    session.commit()
    _pay_late(client, session, cancelled, event_id="evt_late")
    _pay_late(client, session, cancelled, event_id="evt_late")
    assert fake_gateway.names().count("refund") == 1


def test_late_payment_on_a_build_order_marks_the_build_ordered_again(client, session, buyer, product_by_sku):
    skus = [
        "FRG-CPU-R7-7800X3D",
        "FRG-MB-MSI-B650-TOMAHAWK",
        "FRG-RAM-CR-VEN-32-6000",
        "FRG-SSD-SAM-990PRO-2TB",
        "FRG-GPU-MSI-4070S-V2X",
        "FRG-PSU-CR-RM850E",
        "FRG-CASE-FD-NORTH",
        "FRG-COOL-TR-PA120SE",
    ]
    me = client.get("/api/v1/auth/me", headers=buyer).get_json()["id"]
    build = Build(user_id=me, name="Rig")
    for sku in skus:
        build.items.append(BuildItem.for_product(product_by_sku(sku)))
    session.add(build)
    session.flush()
    build.status = BuildStatus.VALIDATED
    session.commit()

    order = session.scalar(
        select(Order).where(Order.order_number == _checkout(client, buyer, {"source": {"build_id": build.id}}))
    )
    _expire_and_cancel(session, order)
    build.status = BuildStatus.VALIDATED  # what cancellation does for a build order
    session.commit()

    _pay_late(client, session, order)
    assert order.status is OrderStatus.PAID
    assert session.get(Build, build.id).status is BuildStatus.ORDERED
