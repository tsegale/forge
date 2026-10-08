"""Stock locking shared by every path that moves inventory: checkout, payment, the sweeper.

Inventory rows are always locked in product_id order, so any two of these paths running at once
wait for each other instead of deadlocking.
"""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select, update

from ..extensions import db
from ..models import Inventory, StockReservation
from ..models.enums import ReservationStatus


def lock_inventory(product_ids: Iterable[int]) -> dict[int, Inventory]:
    """Lock inventory rows FOR UPDATE in product id order, so concurrent checkouts cannot deadlock."""
    ids = sorted(set(product_ids))
    rows = db.session.scalars(
        select(Inventory).where(Inventory.product_id.in_(ids)).order_by(Inventory.product_id).with_for_update()
    )
    return {row.product_id: row for row in rows}


def order_reservations(order_id: int) -> list[StockReservation]:
    """An order's stock reservations, in product id order."""
    return list(
        db.session.scalars(
            select(StockReservation).where(StockReservation.order_id == order_id).order_by(StockReservation.product_id)
        )
    )


def resolve_reservations(order_id: int, from_statuses: tuple[ReservationStatus, ...], to: ReservationStatus) -> int:
    """Move an order's reservations to ``to``; the trigger adjusts inventory. Locks the inventory
    rows first (in product_id order). Returns how many reservations changed."""
    reservations = [r for r in order_reservations(order_id) if r.status in from_statuses]
    if not reservations:
        return 0
    lock_inventory(r.product_id for r in reservations)
    result = db.session.execute(
        update(StockReservation)
        .where(StockReservation.order_id == order_id, StockReservation.status.in_(from_statuses))
        .values(status=to)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount
