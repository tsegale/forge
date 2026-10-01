"""Refunds: the gateway call happens outside any transaction; its outcome is recorded after.

Callers first commit a *_PENDING / REFUND_REQUESTED event, then call ``refund``. A crash between
the two leaves the request on record, and the idempotency key makes a retry return the same
refund instead of refunding twice.
"""

from __future__ import annotations

import logging

from sqlalchemy import select

from ..extensions import db
from ..models import Order, Payment, PaymentEvent
from ..models.enums import OrderStatus, PaymentEventKind, PaymentStatus
from ..payments import PaymentGatewayError, gateway
from .audit import set_actor

logger = logging.getLogger(__name__)


def refund(
    *,
    order_id: int,
    payment_id: int,
    idempotency_key: str,
    succeeded_kind: PaymentEventKind,
    actor_user_id: int | None,
) -> bool:
    """Refund a succeeded payment in full and record the outcome. Returns True on success."""
    payment = db.session.get(Payment, payment_id)
    intent_id, amount, number = payment.provider_payment_id, payment.amount_cents, payment.order.order_number
    db.session.commit()  # nothing held across the network call

    try:
        result = gateway().refund(
            intent_id, amount_cents=amount, idempotency_key=idempotency_key, metadata={"order_number": number}
        )
    except PaymentGatewayError as exc:
        logger.error("Refund for order %s failed: %s", number, exc)
        db.session.add(
            PaymentEvent(
                order_id=order_id,
                payment_id=payment_id,
                kind=PaymentEventKind.REFUND_FAILED,
                details={"error": str(exc), "retryable": exc.retryable},
                actor_user_id=actor_user_id,
            )
        )
        db.session.commit()
        return False

    set_actor(db.session, actor_user_id)
    order = db.session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    payment = db.session.get(Payment, payment_id)
    payment.status = PaymentStatus.REFUNDED
    if order.status is not OrderStatus.REFUNDED:
        order.status = OrderStatus.REFUNDED
    db.session.add(
        PaymentEvent(
            order_id=order_id,
            payment_id=payment_id,
            kind=succeeded_kind,
            details={"refund_id": result.id, "amount_cents": result.amount_cents, "refund_status": result.status},
            actor_user_id=actor_user_id,
        )
    )
    db.session.commit()
    return True
