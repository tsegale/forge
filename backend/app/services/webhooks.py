"""Stripe webhook processing.

Each delivery is verified, then handled in ONE transaction that starts by recording the event in
processed_webhook_events with INSERT ... ON CONFLICT DO NOTHING. A duplicate delivery inserts
nothing and is acknowledged without effect; if handling fails, the dedupe row rolls back with
the effects and Stripe's retry gets a clean second attempt. Work that must happen outside the
transaction (emails, refund calls) is returned as callbacks and run only after the commit.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from ..extensions import db
from ..models import Build, Order, Payment, PaymentEvent, ProcessedWebhookEvent
from ..models.enums import BuildStatus, OrderStatus, PaymentEventKind, PaymentStatus, ReservationStatus
from ..payments import WebhookEvent, gateway
from . import refunds
from .audit import set_actor
from .stock import lock_inventory, order_reservations, resolve_reservations

logger = logging.getLogger(__name__)
PROVIDER = "stripe"

AfterCommit = Callable[[], None]


@dataclass
class Outcome:
    duplicate: bool = False
    handled: bool = False
    after_commit: list[AfterCommit] = field(default_factory=list)


def process(payload: bytes, signature: str | None) -> Outcome:
    event = gateway().parse_webhook(payload, signature)  # raises InvalidWebhook
    outcome = Outcome()
    first_delivery = db.session.execute(
        insert(ProcessedWebhookEvent)
        .values(provider=PROVIDER, event_id=event.id, event_type=event.type, payload=dict(event.raw))
        .on_conflict_do_nothing(index_elements=["provider", "event_id"])
        .returning(ProcessedWebhookEvent.event_id)
    ).scalar_one_or_none()
    if first_delivery is None:
        db.session.rollback()
        outcome.duplicate = True
        return outcome

    handler = HANDLERS.get(event.type)
    if handler is not None:
        set_actor(db.session, None)  # status changes made by the payment provider, not a person
        handler(event, outcome)
        outcome.handled = True
    db.session.commit()
    for action in outcome.after_commit:
        try:
            action()
        except Exception:  # noqa: BLE001  the event is committed; a failed follow-up must not undo it
            logger.exception("Post-commit action failed for event %s", event.id)
    return outcome


# --------------------------------------------------------------------------- lookups


def _locked_payment(intent: Mapping[str, Any]) -> tuple[Payment | None, Order | None]:
    """The payment and its order, both locked. If the intent was created but never recorded
    (the process died between the Stripe call and the insert), recover it from the metadata."""
    payment = db.session.scalar(select(Payment).where(Payment.provider_payment_id == intent["id"]).with_for_update())
    order_id = payment.order_id if payment else _order_id_from_metadata(intent)
    if order_id is None:
        return None, None
    order = db.session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if payment is None and order is not None:
        payment = Payment(
            order_id=order.id,
            provider=PROVIDER,
            provider_payment_id=intent["id"],
            amount_cents=intent["amount"],
            currency=str(intent["currency"]).upper(),
            status=PaymentStatus.REQUIRES_PAYMENT,
        )
        db.session.add(payment)
        db.session.flush()
    return payment, order


def _order_id_from_metadata(intent: Mapping[str, Any]) -> int | None:
    number = (intent.get("metadata") or {}).get("order_number")
    if not number:
        return None
    return db.session.scalar(select(Order.id).where(Order.order_number == number))


def _event(order: Order, payment: Payment | None, kind: PaymentEventKind, **details: Any) -> None:
    db.session.add(
        PaymentEvent(order_id=order.id, payment_id=payment.id if payment else None, kind=kind, details=details)
    )


# --------------------------------------------------------------------------- handlers


def _amount_matches(intent: Mapping[str, Any], order: Order) -> bool:
    return (
        intent.get("amount") == order.total_cents and str(intent.get("currency", "")).lower() == order.currency.lower()
    )


def on_succeeded(event: WebhookEvent, outcome: Outcome) -> None:
    intent = event.object
    payment, order = _locked_payment(intent)
    if order is None:
        logger.warning("payment_intent.succeeded %s matches no order", intent.get("id"))
        return
    if not _amount_matches(intent, order):
        _event(
            order,
            payment,
            PaymentEventKind.AMOUNT_MISMATCH,
            intent_amount=intent.get("amount"),
            intent_currency=intent.get("currency"),
            order_total=order.total_cents,
            order_currency=order.currency,
        )
        logger.error("Amount mismatch on order %s: refusing to mark it paid", order.order_number)
        return

    payment.status = PaymentStatus.SUCCEEDED
    if order.status is OrderStatus.PENDING_PAYMENT:
        resolve_reservations(order.id, (ReservationStatus.ACTIVE,), ReservationStatus.COMMITTED)
        db.session.flush()  # the paid guard requires the succeeded payment to be visible
        order.status = OrderStatus.PAID
        _event(order, payment, PaymentEventKind.SUCCEEDED, provider_payment_id=intent["id"])
        outcome.after_commit.extend(after_paid(order.id))
    elif order.status is OrderStatus.CANCELLED:
        on_late_payment(order, payment, intent, outcome)
    # Already paid (or later): a repeated success for the same intent changes nothing.


def on_failed(event: WebhookEvent, outcome: Outcome) -> None:
    payment, order = _locked_payment(event.object)
    if payment is None or order is None or payment.status is not PaymentStatus.REQUIRES_PAYMENT:
        return
    error = event.object.get("last_payment_error") or {}
    payment.status = PaymentStatus.FAILED
    payment.failure_reason = error.get("message") or error.get("code")
    _event(order, payment, PaymentEventKind.FAILED, code=error.get("code"), decline_code=error.get("decline_code"))


def on_canceled(event: WebhookEvent, outcome: Outcome) -> None:
    payment, order = _locked_payment(event.object)
    if payment is None or order is None or payment.status not in (PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.FAILED):
        return
    payment.status = PaymentStatus.CANCELED
    _event(order, payment, PaymentEventKind.CANCELED, reason=event.object.get("cancellation_reason"))


def on_late_payment(order: Order, payment: Payment, intent: Mapping[str, Any], outcome: Outcome) -> None:
    """The customer paid after their reservation expired and the order was cancelled.

    Re-reserve if the stock is still there (the order becomes paid after all); otherwise record
    that a refund is due, commit, and refund outside the transaction. Either way it is recorded."""
    reservations = order_reservations(order.id)
    stock = lock_inventory(r.product_id for r in reservations)
    shortfall = [
        {"product_id": r.product_id, "needed": r.quantity, "available": max(stock[r.product_id].quantity_available, 0)}
        for r in reservations
        if stock[r.product_id].quantity_available < r.quantity
    ]
    if not shortfall:
        resolve_reservations(
            order.id, (ReservationStatus.EXPIRED, ReservationStatus.RELEASED), ReservationStatus.COMMITTED
        )
        db.session.flush()
        order.status = OrderStatus.PAID  # cancelled -> paid, allowed only with this succeeded payment
        if order.build_id is not None:
            build = db.session.get(Build, order.build_id)
            if build is not None:
                build.status = BuildStatus.ORDERED
        _event(order, payment, PaymentEventKind.LATE_PAYMENT_RESERVED, provider_payment_id=intent["id"])
        outcome.after_commit.extend(after_paid(order.id))
        return

    _event(
        order,
        payment,
        PaymentEventKind.LATE_PAYMENT_REFUND_PENDING,
        provider_payment_id=intent["id"],
        shortfall=shortfall,
    )
    order_id, payment_id, number = order.id, payment.id, order.order_number
    outcome.after_commit.append(
        lambda: refunds.refund(
            order_id=order_id,
            payment_id=payment_id,
            idempotency_key=f"forge-order-{number}-late-refund",
            succeeded_kind=PaymentEventKind.LATE_PAYMENT_REFUNDED,
            actor_user_id=None,
        )
    )


def after_paid(order_id: int) -> list[AfterCommit]:
    """Follow-ups once an order is paid: queued only after the payment transaction commits, so a
    worker never picks up an order whose payment then rolled back."""
    from ..tasks import send_order_confirmation  # tasks import the services, not the other way round

    return [lambda: send_order_confirmation.delay(order_id)]


HANDLERS: dict[str, Callable[[WebhookEvent, Outcome], None]] = {
    "payment_intent.succeeded": on_succeeded,
    "payment_intent.payment_failed": on_failed,
    "payment_intent.canceled": on_canceled,
}
