"""Checkout phase one: one transaction reserves stock and creates the order, or creates nothing."""

import threading
import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, select, text, update

from app.extensions import db
from app.models import (
    Address,
    Build,
    BuildItem,
    Cart,
    Inventory,
    Order,
    OrderStatusHistory,
    Product,
    StockReservation,
    User,
)
from app.models.enums import BuildStatus, ReservationStatus
from app.security.passwords import hash_password
from app.security.tokens import issue_access_token
from app.services.pricing import compute

CHECKOUT = "/api/v1/checkout"
CPU, RAM = "FRG-CPU-R7-7800X3D", "FRG-RAM-CR-VEN-32-6000"
ADDRESS = {
    "recipient_name": "Ada Lovelace",
    "line1": "12 Independence Avenue",
    "city": "Windhoek",
    "country_code": "NA",
}


@pytest.fixture()
def buyer(make_user, auth_headers):
    user = make_user()
    return user, auth_headers(user)


def _fill_cart(client, headers, *items):
    for product, quantity in items:
        response = client.post(
            "/api/v1/cart/items", json={"product_id": product.id, "quantity": quantity}, headers=headers
        )
        assert response.status_code == 200, response.get_json()


def _checkout(client, headers, **body):
    return client.post(CHECKOUT, json={"address": ADDRESS} | body, headers=headers)


def _stock(session, product):
    session.expire(product.inventory)
    return product.inventory.quantity_on_hand, product.inventory.quantity_reserved


# --------------------------------------------------------------------- from the cart


def test_cart_checkout_reserves_stock_and_creates_the_order(client, session, buyer, product_by_sku):
    user, headers = buyer
    cpu, ram = product_by_sku(CPU), product_by_sku(RAM)
    on_hand, reserved = _stock(session, cpu)
    _fill_cart(client, headers, (cpu, 1), (ram, 2))

    response = _checkout(client, headers)

    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["status"] == "pending_payment" and body["order_number"].startswith("FRG-")
    goods = cpu.price_cents + 2 * ram.price_cents
    expected = compute(goods, vat_rate_bps=1500, flat_cents=15_000, free_threshold_cents=500_000)
    assert body["totals"]["total"] == {"amount_cents": expected.total_cents, "currency": "nad"}
    assert {i["sku"]: i["quantity"] for i in body["items"]} == {CPU: 1, RAM: 2}
    assert body["shipping_address"]["city"] == "Windhoek"
    expires = datetime.fromisoformat(body["reservation_expires_at"])
    assert timedelta(minutes=14) < expires - datetime.now(UTC) <= timedelta(minutes=15)

    assert _stock(session, cpu) == (on_hand, reserved + 1)  # reserved, not yet sold
    assert client.get("/api/v1/cart", headers=headers).get_json()["items"] == []
    order = session.scalar(select(Order).where(Order.order_number == body["order_number"]))
    first = session.scalars(select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id)).first()
    assert first.changed_by_user_id == user.id  # set_actor ran before the insert


def test_saved_address_is_snapshotted(client, session, buyer, product_by_sku):
    user, headers = buyer
    address = Address(user_id=user.id, type="shipping", **ADDRESS | {"city": "Swakopmund"})
    session.add(address)
    session.flush()
    _fill_cart(client, headers, (product_by_sku(RAM), 1))
    body = client.post(CHECKOUT, json={"address_id": address.id}, headers=headers).get_json()
    address.city = "Walvis Bay"  # a later edit to the address book
    session.flush()
    order = session.scalar(select(Order).where(Order.order_number == body["order_number"]))
    assert [a.city for a in order.addresses] == ["Swakopmund", "Swakopmund"]  # shipping and billing


@pytest.mark.parametrize("body", [{}, {"address": ADDRESS, "address_id": 1}], ids=["neither", "both"])
def test_exactly_one_address_is_required(client, buyer, body):
    assert client.post(CHECKOUT, json=body, headers=buyer[1]).status_code == 422


def test_empty_cart_is_422(client, buyer):
    response = _checkout(client, buyer[1])
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == "cart_empty"


def test_shortfall_is_409_and_creates_nothing(client, session, buyer, product_by_sku):
    _, headers = buyer
    cpu = product_by_sku(CPU)
    cpu.inventory.quantity_on_hand, cpu.inventory.quantity_reserved = 2, 0
    session.commit()  # survives the error response's rollback
    _fill_cart(client, headers, (cpu, 3), (product_by_sku(RAM), 1))
    orders_before = session.scalar(select(func.count()).select_from(Order))

    response = _checkout(client, headers)

    assert response.status_code == 409
    error = response.get_json()["error"]
    assert error["code"] == "insufficient_stock"
    assert error["details"] == [{"product_id": cpu.id, "requested": 3, "available": 2}]
    assert session.scalar(select(func.count()).select_from(Order)) == orders_before
    assert _stock(session, cpu) == (2, 0)
    assert len(client.get("/api/v1/cart", headers=headers).get_json()["items"]) == 2  # cart kept


def test_delisted_product_is_409(client, session, buyer, product_by_sku):
    _, headers = buyer
    ram = product_by_sku(RAM)
    _fill_cart(client, headers, (ram, 1))
    ram.is_active = False
    session.commit()
    response = _checkout(client, headers)
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "product_unavailable"


def test_checkout_requires_authentication(client):
    assert client.post(CHECKOUT, json={"address": ADDRESS}).status_code == 401


# --------------------------------------------------------------------- from a build

GOOD_BUILD = [
    "FRG-CPU-R7-7800X3D",
    "FRG-MB-MSI-B650-TOMAHAWK",
    "FRG-RAM-CR-VEN-32-6000",
    "FRG-SSD-SAM-990PRO-2TB",
    "FRG-GPU-MSI-4070S-V2X",
    "FRG-PSU-CR-RM850E",
    "FRG-CASE-FD-NORTH",
    "FRG-COOL-TR-PA120SE",
]


def _build(session, user, product_by_sku, status):
    build = Build(user_id=user.id, name="Rig")
    for sku in GOOD_BUILD:
        build.items.append(BuildItem.for_product(product_by_sku(sku)))
    session.add(build)
    session.flush()
    build.status = status
    session.commit()
    return build


def test_validated_build_checks_out_and_becomes_ordered(client, session, buyer, product_by_sku):
    user, headers = buyer
    build = _build(session, user, product_by_sku, BuildStatus.VALIDATED)
    response = _checkout(client, headers, source={"build_id": build.id})
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["build_id"] == build.id and len(response.get_json()["items"]) == len(GOOD_BUILD)
    session.expire(build)
    assert build.status is BuildStatus.ORDERED


def test_unvalidated_build_is_409(client, session, buyer, product_by_sku):
    user, headers = buyer
    build = _build(session, user, product_by_sku, BuildStatus.DRAFT)
    response = _checkout(client, headers, source={"build_id": build.id})
    assert response.status_code == 409 and response.get_json()["error"]["code"] == "build_not_validated"


def test_someone_elses_build_is_404(client, session, buyer, product_by_sku, make_user):
    build = _build(session, make_user(), product_by_sku, BuildStatus.VALIDATED)
    assert _checkout(client, buyer[1], source={"build_id": build.id}).status_code == 404


# --------------------------------------------------------------------- the last unit


def _lock_waiters(conn) -> int:
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    return conn.execute(
        text(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
            "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
        )
    ).scalar_one()


def _purge_users(emails):
    """Real-commit cleanup. Active reservations must be released first: the database refuses to
    delete them (they hold stock)."""
    users = db.session.scalars(select(User.id).where(User.email.in_(emails))).all()
    orders = db.session.scalars(select(Order.id).where(Order.user_id.in_(users))).all()
    db.session.execute(
        update(StockReservation)
        .where(StockReservation.order_id.in_(orders), StockReservation.status == ReservationStatus.ACTIVE)
        .values(status=ReservationStatus.RELEASED)
    )
    db.session.execute(delete(Order).where(Order.id.in_(orders)))
    db.session.execute(delete(Cart).where(Cart.user_id.in_(users)))
    db.session.execute(delete(User).where(User.id.in_(users)))
    db.session.commit()


def test_two_buyers_racing_for_the_last_unit(app):
    """Both checkouts queue on the inventory row lock; exactly one gets the unit."""
    emails = [f"race-{uuid.uuid4().hex[:8]}@example.com" for _ in range(2)]
    with app.app_context():
        cpu = db.session.scalar(select(Product).where(Product.sku == CPU))
        product_id, inventory = cpu.id, db.session.get(Inventory, cpu.id)
        original = (inventory.quantity_on_hand, inventory.quantity_reserved)
        inventory.quantity_on_hand, inventory.quantity_reserved = 1, 0
        headers = []
        for email in emails:
            user = User(email=email, password_hash=hash_password("x" * 12), first_name="R", last_name="C")
            db.session.add(user)
            db.session.flush()
            headers.append({"Authorization": f"Bearer {issue_access_token(user.id, 'customer').token}"})
        db.session.commit()
    try:
        for h in headers:
            added = app.test_client().post("/api/v1/cart/items", json={"product_id": product_id}, headers=h)
            assert added.status_code == 200
        outcomes: list[tuple[int, str | None]] = []

        def buy(h):
            r = app.test_client().post(CHECKOUT, json={"address": ADDRESS}, headers=h)
            outcomes.append((r.status_code, ((r.get_json() or {}).get("error") or {}).get("code")))

        with app.app_context(), db.engine.connect() as holder:
            holder.execute(text("SELECT 1 FROM inventory WHERE product_id = :p FOR UPDATE"), {"p": product_id})
            threads = [threading.Thread(target=buy, args=(h,)) for h in headers]
            for t in threads:
                t.start()
            deadline = time.monotonic() + 10
            while _lock_waiters(holder) < 2 and time.monotonic() < deadline:
                time.sleep(0.02)
            holder.commit()
        for t in threads:
            t.join(timeout=30)
            assert not t.is_alive()

        # The loser is turned away by the service under the inventory lock (insufficient_stock), not by
        # the database CHECK backstop (stock_below_reserved) that would fire without that lock.
        assert sorted(outcomes, key=lambda o: o[0]) == [(201, None), (409, "insufficient_stock")]
        with app.app_context():
            assert db.session.get(Inventory, product_id).quantity_reserved == 1
    finally:
        with app.app_context():
            _purge_users(emails)
            inventory = db.session.get(Inventory, product_id)
            inventory.quantity_on_hand, inventory.quantity_reserved = original
            db.session.commit()
