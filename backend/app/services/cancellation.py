"""Cancelling unpaid orders: by the customer, or by the sweeper when the hold expires.

The database work is one transaction (lock the order, release the stock, cancel); the
PaymentIntent is cancelled only after that commits. If the customer pays in between, the cancel
call is a no-op and the late-payment webhook path re-reserves or refunds.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from ..extensions import db
from ..models import Build, Order, Payment
from ..models.enums import BuildStatus, OrderStatus, PaymentStatus, ReservationStatus
from ..payments import PaymentGatewayError, gateway
from .audit import set_actor
from .stock import resolve_reservations

logger = logging.getLogger(__name__)


def cancel_locked_order(order: Order, *, reservations_to: ReservationStatus, actor_user_id: int | None) -> list[str]:
    """Cancel a pending order that the caller has locked. Returns the PaymentIntent ids to cancel
    once the transaction commits."""
    set_actor(db.session, actor_user_id)
    resolve_reservations(order.id, (ReservationStatus.ACTIVE,), reservations_to)
    order.status = OrderStatus.CANCELLED
    if order.build_id is not None:
        build = db.session.get(Build, order.build_id)
        if build is not None and build.status is BuildStatus.ORDERED:
            build.status = BuildStatus.VALIDATED  # unchanged parts: still compatible and complete
    return list(
        db.session.scalars(
            select(Payment.provider_payment_id).where(
                Payment.order_id == order.id,
                Payment.status.in_((PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.PROCESSING, PaymentStatus.FAILED)),
            )
        )
    )


def cancel_intents(order_number: str, intent_ids: list[str]) -> None:
    """After commit: stop the customer from paying for a cancelled order. Best effort; a payment
    that still gets through is handled by the late-payment path."""
    for intent_id in intent_ids:
        try:
            gateway().cancel_intent(intent_id, idempotency_key=f"forge-order-{order_number}-cancel-{intent_id}")
        except PaymentGatewayError as exc:
            logger.warning("Could not cancel PaymentIntent for order %s: %s", order_number, exc)
