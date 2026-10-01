"""Stripe webhooks: real signature verification, exactly-once effects, and the amount check."""

import pytest
from sqlalchemy import func, select

from app.models import (
    Order,
    OrderStatusHistory,
    Payment,
    PaymentEvent,
    ProcessedWebhookEvent,
    StockReservation,
)
from app.models.enums import OrderStatus, PaymentEventKind, PaymentStatus, ReservationStatus
from app.services import webhooks as webhook_service
from tests.stripe_helpers import event, payment_intent, sign

WEBHOOK = "/api/v1/webhooks/stripe"
RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}


@pytest.fixture()
def order(client, session, make_user, auth_headers, product_by_sku):
    """A pending order whose PaymentIntent exists, created through the real checkout."""
    headers = auth_headers(make_user())
    client.post("/api/v1/cart/items", json={"product_id": product_by_sku(RAM).id, "quantity": 2}, headers=headers)
    number = client.post("/api/v1/checkout", json={"address": ADDRESS}, headers=headers).get_json()["order_number"]
    return session.scalar(select(Order).where(Order.order_number == number))


def _intent_id(session, order):
    return session.scalar(select(Payment.provider_payment_id).where(Payment.order_id == order.id))


def _deliver(client, event_type, obj, event_id=None, signature=None):
    body = event(event_type, obj, event_id=event_id)
    return client.post(
        WEBHOOK,
        data=body,
        headers={
            "Stripe-Signature": sign(body) if signature is None else signature,
            "Content-Type": "application/json",
        },
    )


def _succeed(client, session, order, **overrides):
    obj = payment_intent(
        _intent_id(session, order), order.total_cents, "nad", metadata={"order_number": order.order_number}
    )
    return _deliver(client, "payment_intent.succeeded", obj | overrides, event_id=overrides.pop("event_id", None))


def _kinds(session, order):
    return session.scalars(
        select(PaymentEvent.kind).where(PaymentEvent.order_id == order.id).order_by(PaymentEvent.id)
    ).all()


def _stock(session, product):
    session.expire(product.inventory)
    return product.inventory.quantity_on_hand, product.inventory.quantity_reserved


# --------------------------------------------------------------------- success


def test_success_marks_the_order_paid_and_sells_the_reserved_stock(client, session, order, product_by_sku):
    ram = product_by_sku(RAM)
    on_hand, reserved = _stock(session, ram)

    response = _succeed(client, session, order)

    assert response.status_code == 200 and response.get_json() == {"received": True, "duplicate": False}
    session.refresh(order)
    assert order.status is OrderStatus.PAID
    assert _stock(session, ram) == (on_hand - 2, reserved - 2)
    statuses = session.scalars(select(StockReservation.status).where(StockReservation.order_id == order.id)).all()
    assert statuses == [ReservationStatus.COMMITTED]
    assert session.scalar(select(Payment.status).where(Payment.order_id == order.id)) is PaymentStatus.SUCCEEDED
    assert _kinds(session, order) == [PaymentEventKind.INTENT_CREATED, PaymentEventKind.SUCCEEDED]
    paid = session.scalars(
        select(OrderStatusHistory).where(
            OrderStatusHistory.order_id == order.id, OrderStatusHistory.to_status == OrderStatus.PAID
        )
    ).one()
    assert paid.changed_by_user_id is None  # the payment provider, not a person


def test_duplicate_delivery_has_no_second_effect(client, session, order):
    first = _succeed(client, session, order, event_id="evt_same")
    second = _succeed(client, session, order, event_id="evt_same")
    assert first.get_json()["duplicate"] is False and second.get_json()["duplicate"] is True
    assert _kinds(session, order).count(PaymentEventKind.SUCCEEDED) == 1
    assert (
        session.scalar(
            select(func.count()).select_from(ProcessedWebhookEvent).where(ProcessedWebhookEvent.event_id == "evt_same")
        )
        == 1
    )


def test_a_second_success_event_for_a_paid_order_changes_nothing(client, session, order):
    _succeed(client, session, order)
    assert _succeed(client, session, order).status_code == 200
    assert _kinds(session, order).count(PaymentEventKind.SUCCEEDED) == 1


def test_unrecorded_intent_is_recovered_from_metadata(client, session, order):
    """The process died between creating the intent and recording it: the webhook still lands."""
    session.query(PaymentEvent).filter_by(order_id=order.id).delete()
    session.query(Payment).filter_by(order_id=order.id).delete()
    session.commit()
    obj = payment_intent("pi_never_recorded", order.total_cents, metadata={"order_number": order.order_number})
    assert _deliver(client, "payment_intent.succeeded", obj).status_code == 200
    session.refresh(order)
    assert order.status is OrderStatus.PAID


# --------------------------------------------------------------------- the amount check


@pytest.mark.parametrize("tamper", [{"amount": -1}, {"currency": "usd"}], ids=["one-cent-short", "other-currency"])
def test_mismatched_payment_does_not_mark_the_order_paid(client, session, order, tamper):
    overrides = {"amount": order.total_cents - 1} if "amount" in tamper else tamper
    response = _succeed(client, session, order, **overrides)
    assert response.status_code == 200  # acknowledged, so Stripe stops retrying; the mismatch is recorded
    session.refresh(order)
    assert order.status is OrderStatus.PENDING_PAYMENT
    assert _kinds(session, order)[-1] is PaymentEventKind.AMOUNT_MISMATCH
    assert session.scalar(select(Payment.status).where(Payment.order_id == order.id)) is PaymentStatus.REQUIRES_PAYMENT


# --------------------------------------------------------------------- other events


def test_failed_payment_is_recorded_and_the_reservation_kept(client, session, order):
    obj = payment_intent(
        _intent_id(session, order),
        order.total_cents,
        status="requires_payment_method",
        last_payment_error={
            "code": "card_declined",
            "decline_code": "insufficient_funds",
            "message": "Your card was declined.",
        },
    )
    _deliver(client, "payment_intent.payment_failed", obj)
    payment = session.scalar(select(Payment).where(Payment.order_id == order.id))
    session.refresh(payment)
    assert (payment.status, payment.failure_reason) == (PaymentStatus.FAILED, "Your card was declined.")
    session.refresh(order)
    assert order.status is OrderStatus.PENDING_PAYMENT  # the customer may retry until the hold expires


def test_canceled_intent_is_recorded(client, session, order):
    _deliver(
        client,
        "payment_intent.canceled",
        payment_intent(_intent_id(session, order), order.total_cents, status="canceled"),
    )
    assert session.scalar(select(Payment.status).where(Payment.order_id == order.id)) is PaymentStatus.CANCELED


def test_unhandled_event_types_are_acknowledged(client, session):
    response = _deliver(client, "customer.created", {"id": "cus_123", "object": "customer"}, event_id="evt_other")
    assert response.status_code == 200
    assert session.get(ProcessedWebhookEvent, ("stripe", "evt_other")) is not None


# --------------------------------------------------------------------- verification and atomicity


@pytest.mark.parametrize(
    "signature", [sign(b"something else"), "t=1,v1=deadbeef", ""], ids=["signed-other-body", "garbage", "empty"]
)
def test_bad_signatures_are_rejected_before_anything_is_recorded(client, session, signature):
    before = session.scalar(select(func.count()).select_from(ProcessedWebhookEvent))
    response = _deliver(client, "payment_intent.succeeded", payment_intent("pi_x", 100), signature=signature)
    assert response.status_code == 400 and response.get_json()["error"]["code"] == "invalid_webhook"
    assert session.scalar(select(func.count()).select_from(ProcessedWebhookEvent)) == before


def test_a_failing_handler_leaves_no_trace_so_the_retry_succeeds(client, session, order, monkeypatch):
    def broken(event, outcome):
        raise RuntimeError("database hiccup")

    monkeypatch.setitem(webhook_service.HANDLERS, "payment_intent.succeeded", broken)
    assert _succeed(client, session, order, event_id="evt_retry").status_code == 500
    assert session.get(ProcessedWebhookEvent, ("stripe", "evt_retry")) is None  # rolled back with the effects

    monkeypatch.undo()
    assert _succeed(client, session, order, event_id="evt_retry").get_json()["duplicate"] is False
    session.refresh(order)
    assert order.status is OrderStatus.PAID
