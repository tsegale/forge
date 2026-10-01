"""Release stock held by orders that were never paid.

Expired orders are claimed with SELECT ... FOR UPDATE SKIP LOCKED: concurrent sweepers take
disjoint batches instead of queuing behind each other, and an order a webhook is busy marking
paid is skipped (the next pass sees it paid and leaves it alone). Each batch is one transaction;
PaymentIntents are cancelled only after it commits.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select

from ..extensions import db
from ..models import Order
from ..models.enums import OrderStatus, ReservationStatus
from .cancellation import cancel_intents, cancel_locked_order

BATCH_SIZE = 100


@dataclass(frozen=True, slots=True)
class SweepResult:
    cancelled: list[str]


def sweep(now: datetime | None = None, batch_size: int = BATCH_SIZE) -> SweepResult:
    now = now or datetime.now(UTC)
    orders = db.session.scalars(
        select(Order)
        .where(Order.status == OrderStatus.PENDING_PAYMENT, Order.reservation_expires_at < now)
        .order_by(Order.reservation_expires_at)
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    ).all()
    to_cancel: list[tuple[str, list[str]]] = []
    for order in orders:
        intents = cancel_locked_order(order, reservations_to=ReservationStatus.EXPIRED, actor_user_id=None)
        to_cancel.append((order.order_number, intents))
    db.session.commit()
    for number, intents in to_cancel:
        cancel_intents(number, intents)
    return SweepResult(cancelled=[number for number, _ in to_cancel])
