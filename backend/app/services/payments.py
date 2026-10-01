"""Phase two of checkout: start the payment, strictly after the order transaction has committed.

The PaymentIntent is created with an idempotency key derived from the order, so a retry (a timeout,
a double click, POST /orders/{n}/payment) returns the same intent, and its client secret, instead
of creating a second charge. The secret is never stored. No row lock is held during the call.
"""

from __future__ import annotations

import logging

from sqlalchemy.dialects.postgresql import insert

from ..errors import Conflict
from ..extensions import db
from ..models import Order, Payment, PaymentEvent
from ..models.enums import OrderStatus, PaymentEventKind, PaymentStatus
from ..payments import Intent, PaymentGatewayError, gateway
from ..schemas.orders import PaymentInfo

logger = logging.getLogger(__name__)


def start_payment(order: Order) -> PaymentInfo | None:
    """Create (or fetch, via the idempotency key) the order's PaymentIntent and record it.
    Returns None if the gateway is unavailable; the order keeps its reservation until expiry,
    so the client can retry."""
    if order.status is not OrderStatus.PENDING_PAYMENT:
        raise Conflict("This order is not awaiting payment.", code="order_not_payable")
    # Copy what the call needs, then end the transaction. Touching the order after the commit would
    # reload it and silently open a new transaction, held idle across the network call.
    amount, currency, number, order_id = order.total_cents, order.currency, order.order_number, order.id
    db.session.commit()  # a no-op if no transaction is open

    try:
        intent = gateway().create_intent(
            amount_cents=amount,
            currency=currency,
            idempotency_key=f"forge-order-{number}-intent",
            metadata={"order_number": number, "order_id": str(order_id)},
        )
    except PaymentGatewayError as exc:
        logger.warning("Could not start payment for order %s: %s", number, exc)
        return None

    _record_intent(order, intent)
    return PaymentInfo(client_secret=intent.client_secret, status=intent.status)


def _record_intent(order: Order, intent: Intent) -> None:
    inserted = db.session.execute(
        insert(Payment)
        .values(
            order_id=order.id,
            provider="stripe",
            provider_payment_id=intent.id,
            amount_cents=intent.amount_cents,
            currency=intent.currency.upper(),
            status=PaymentStatus.REQUIRES_PAYMENT,
        )
        .on_conflict_do_nothing(index_elements=["provider_payment_id"])
        .returning(Payment.id)
    ).scalar_one_or_none()
    if inserted is not None:  # first time this intent is seen
        db.session.add(
            PaymentEvent(
                order_id=order.id,
                payment_id=inserted,
                kind=PaymentEventKind.INTENT_CREATED,
                details={"provider_payment_id": intent.id, "amount_cents": intent.amount_cents},
            )
        )
    db.session.commit()
