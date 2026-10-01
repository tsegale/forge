"""The reservation sweeper: expired unpaid orders release their stock; locked rows are skipped."""

import threading
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text, update

from app.extensions import db
from app.models import Build, BuildItem, Order, OrderStatusHistory, Payment, Product, StockReservation
from app.models.enums import BuildStatus, OrderStatus, PaymentStatus, ReservationStatus
from app.services.sweeper import sweep
from app.tasks import sweep_expired_reservations
from tests.realdb import make_user, purge_users

RAM = "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {"recipient_name": "Ada Lovelace", "line1": "12 Independence Avenue", "city": "Windhoek"}
PAST = datetime.now(UTC) - timedelta(minutes=1)


def _place(client, headers, product_id, quantity=1, body=None):
    if body is None:
        client.post("/api/v1/cart/items", json={"product_id": product_id, "quantity": quantity}, headers=headers)
    response = client.post("/api/v1/checkout", json={"address": ADDRESS} | (body or {}), headers=headers)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["order_number"]


def _expire(session, number):
    session.execute(update(Order).where(Order.order_number == number).values(reservation_expires_at=PAST))
    session.commit()
    return session.scalar(select(Order).where(Order.order_number == number))


@pytest.fixture()
def buyer(make_user, auth_headers):
    return auth_headers(make_user())


def test_expired_order_is_cancelled_and_its_stock_released(client, session, buyer, product_by_sku, fake_gateway):
    ram = product_by_sku(RAM)
    session.expire(ram.inventory)
    reserved_before = ram.inventory.quantity_reserved
    order = _expire(session, _place(client, buyer, ram.id, 2))

    result = sweep()

    assert result.cancelled == [order.order_number]
    session.expire_all()
    assert order.status is OrderStatus.CANCELLED
    assert ram.inventory.quantity_reserved == reserved_before
    reservations = session.scalars(select(StockReservation.status).where(StockReservation.order_id == order.id)).all()
    assert reservations == [ReservationStatus.EXPIRED]
    last = session.scalars(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id).order_by(OrderStatusHistory.id)
    ).all()[-1]
    assert (last.to_status, last.changed_by_user_id) == (OrderStatus.CANCELLED, None)  # the system
    assert fake_gateway.names()[-1] == "cancel_intent"  # after the commit


def test_unexpired_and_paid_orders_are_left_alone(client, session, buyer, product_by_sku):
    ram = product_by_sku(RAM)
    fresh = _place(client, buyer, ram.id)
    paid = _expire(session, _place(client, buyer, ram.id))
    session.execute(update(Payment).where(Payment.order_id == paid.id).values(status=PaymentStatus.SUCCEEDED))
    paid.status = OrderStatus.PAID
    session.commit()

    assert sweep().cancelled == []
    statuses = dict(
        session.execute(
            select(Order.order_number, Order.status).where(Order.order_number.in_([fresh, paid.order_number]))
        ).all()
    )
    assert statuses == {fresh: OrderStatus.PENDING_PAYMENT, paid.order_number: OrderStatus.PAID}


def test_cancelled_build_order_returns_the_build_to_validated(client, session, buyer, product_by_sku):
    me = client.get("/api/v1/auth/me", headers=buyer).get_json()["id"]
    build = Build(user_id=me, name="Rig")
    for sku in (
        "FRG-CPU-R7-7800X3D",
        "FRG-MB-MSI-B650-TOMAHAWK",
        RAM,
        "FRG-SSD-SAM-990PRO-2TB",
        "FRG-PSU-CR-RM850E",
        "FRG-CASE-FD-NORTH",
        "FRG-COOL-TR-PA120SE",
    ):
        build.items.append(BuildItem.for_product(product_by_sku(sku)))
    session.add(build)
    session.flush()
    build.status = BuildStatus.VALIDATED
    session.commit()

    _expire(session, _place(client, buyer, None, body={"source": {"build_id": build.id}}))
    sweep()
    session.expire_all()
    assert build.status is BuildStatus.VALIDATED  # can be checked out again


def test_the_celery_task_runs_the_sweeper(client, session, buyer, product_by_sku):
    order = _expire(session, _place(client, buyer, product_by_sku(RAM).id))
    assert sweep_expired_reservations.delay().get() == [order.order_number]


def test_locked_orders_are_skipped_not_waited_for(app):
    """Real commits: one expired order is locked by another session (say, a webhook mid-flight).
    The sweeper must not block on it: it cancels the other order and leaves the locked one for
    its next pass."""
    with app.app_context():
        email, headers = make_user("sweep")
        ram = db.session.scalar(select(Product.id).where(Product.sku == RAM))
    try:
        client = app.test_client()
        numbers = [_place(client, headers, ram) for _ in range(2)]
        with app.app_context():
            db.session.execute(update(Order).where(Order.order_number.in_(numbers)).values(reservation_expires_at=PAST))
            db.session.commit()
            locked_id = db.session.scalar(select(Order.id).where(Order.order_number == numbers[0]))

        result: dict = {}

        def run():
            with app.app_context():
                result["cancelled"] = sweep().cancelled

        with app.app_context(), db.engine.connect() as holder:
            holder.execute(text("SELECT 1 FROM orders WHERE id = :id FOR UPDATE"), {"id": locked_id})
            worker = threading.Thread(target=run)
            worker.start()
            worker.join(timeout=10)
            assert not worker.is_alive(), "the sweeper blocked on a locked order"
            holder.commit()

        assert result["cancelled"] == [numbers[1]]
        with app.app_context():
            assert sweep().cancelled == [numbers[0]]  # picked up once the lock is gone
    finally:
        with app.app_context():
            purge_users([email])
