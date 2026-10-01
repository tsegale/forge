"""Helpers for tests that must run on real, committed transactions (locks, concurrency, and
"nothing is held across a network call"). Such tests create their own data and clean it up."""

from __future__ import annotations

import time
import uuid
from contextlib import contextmanager

from sqlalchemy import delete, select, text, update

from app.extensions import db
from app.models import Cart, Inventory, Order, Payment, PaymentEvent, StockReservation, User
from app.models.enums import ReservationStatus
from app.security.passwords import hash_password
from app.security.tokens import issue_access_token


def lock_waiters(conn) -> int:
    # pg_stat_activity is snapshotted once per transaction; clear it so each poll is fresh.
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    return conn.execute(
        text(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
            "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
        )
    ).scalar_one()


def wait_for_lock_waiters(conn, count: int, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while lock_waiters(conn) < count:
        if time.monotonic() > deadline:
            raise AssertionError(f"expected {count} sessions blocked on a lock")
        time.sleep(0.02)


def held_locks(conn, tables: tuple[str, ...]) -> list[tuple[int, str, str]]:
    """Locks other sessions hold on ``tables`` right now, plus sessions idle inside a transaction."""
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    rows = conn.execute(
        text(
            "SELECT l.pid, c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation "
            "WHERE c.relname = ANY(:tables) AND l.pid <> pg_backend_pid() AND l.granted"
        ),
        {"tables": list(tables)},
    ).all()
    idle = conn.execute(
        text(
            "SELECT pid, 'idle in transaction', '' FROM pg_stat_activity WHERE datname = current_database() "
            "AND state LIKE 'idle in transaction%' AND pid <> pg_backend_pid()"
        )
    ).all()
    return [tuple(r) for r in (*rows, *idle)]


def make_user(email_prefix: str = "real") -> tuple[str, dict[str, str]]:
    """A committed customer and their bearer header. Call inside an app context."""
    email = f"{email_prefix}-{uuid.uuid4().hex[:8]}@example.com"
    user = User(email=email, password_hash=hash_password("x" * 12), first_name="R", last_name="C")
    db.session.add(user)
    db.session.commit()
    return email, {"Authorization": f"Bearer {issue_access_token(user.id, 'customer').token}"}


def purge_users(emails: list[str]) -> None:
    """Delete committed test users and everything they own. Active reservations are released
    first: the database refuses to delete them, because they hold stock."""
    users = db.session.scalars(select(User.id).where(User.email.in_(emails))).all()
    orders = db.session.scalars(select(Order.id).where(Order.user_id.in_(users))).all()
    db.session.execute(
        update(StockReservation)
        .where(StockReservation.order_id.in_(orders), StockReservation.status == ReservationStatus.ACTIVE)
        .values(status=ReservationStatus.RELEASED)
    )
    db.session.execute(delete(PaymentEvent).where(PaymentEvent.order_id.in_(orders)))
    db.session.execute(delete(Payment).where(Payment.order_id.in_(orders)))
    db.session.execute(delete(Order).where(Order.id.in_(orders)))
    db.session.execute(delete(Cart).where(Cart.user_id.in_(users)))
    db.session.execute(delete(User).where(User.id.in_(users)))
    db.session.commit()


@contextmanager
def preserved_inventory(product_id: int):
    """Restore a product's stock levels after a real-commit test changes them."""
    inventory = db.session.get(Inventory, product_id)
    original = (inventory.quantity_on_hand, inventory.quantity_reserved)
    try:
        yield inventory
    finally:
        db.session.rollback()
        inventory = db.session.get(Inventory, product_id)
        inventory.quantity_on_hand, inventory.quantity_reserved = original
        db.session.commit()
