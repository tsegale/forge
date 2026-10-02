"""Demo data: an idempotent reset for presentations.

``flask seed demo`` restores the catalog and its seeded stock, clears transactional data, creates a
known admin and customer, and adds past orders in several states, so every screen has something to
show. Orders are created through the same database rules as real ones: a matching succeeded
payment before 'paid', reservations that turn into sales, and the audited state machine.

DEMO ONLY. The credentials below are published in the README.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select, update

from .cli import DEFAULT_SEED, load_catalog
from .extensions import db
from .models import (
    Address,
    Build,
    BuildItem,
    Cart,
    Order,
    OrderAddress,
    OrderItem,
    Payment,
    PaymentEvent,
    Product,
    StockReservation,
    User,
)
from .models.enums import (
    AddressType,
    BuildStatus,
    OrderStatus,
    PaymentEventKind,
    PaymentStatus,
    ReservationStatus,
    UserRole,
)
from .security.passwords import hash_password
from .services import pricing
from .services.audit import set_actor


@dataclass(frozen=True, slots=True)
class DemoAccount:
    email: str
    password: str
    first_name: str
    last_name: str
    role: UserRole


ADMIN = DemoAccount("demo-admin@example.com", "forge-demo-admin-2026", "Dana", "Admin", UserRole.ADMIN)
CUSTOMER = DemoAccount(
    "demo-customer@example.com", "forge-demo-customer-2026", "Ndapewa", "Shilongo", UserRole.CUSTOMER
)

ADDRESS = {
    "recipient_name": "Ndapewa Shilongo",
    "phone": "+264 81 555 0100",
    "line1": "14 Fidel Castro Street",
    "city": "Windhoek",
    "postal_code": "10005",
    "country_code": "NA",
}

# (SKUs and quantities, final status, days ago)
PAST_ORDERS: list[tuple[list[tuple[str, int]], OrderStatus, int]] = [
    ([("FRG-CPU-R5-7600X", 1), ("FRG-MB-GB-B650M-ELITE", 1)], OrderStatus.DELIVERED, 21),
    ([("FRG-GPU-NV-5070-FE", 1)], OrderStatus.SHIPPED, 6),
    ([("FRG-SSD-SAM-990PRO-2TB", 2)], OrderStatus.FULFILLING, 3),
    ([("FRG-RAM-CR-VEN-32-6000", 1), ("FRG-COOL-TR-PA120SE", 1)], OrderStatus.PAID, 1),
    ([("FRG-PSU-CR-RM850E", 1)], OrderStatus.REFUNDED, 9),
]
FULFILMENT_PATH = [OrderStatus.FULFILLING, OrderStatus.SHIPPED, OrderStatus.DELIVERED]

DEMO_BUILD = [
    "FRG-CPU-R7-7800X3D",
    "FRG-MB-MSI-B650-TOMAHAWK",
    "FRG-RAM-CR-VEN-32-6000",
    "FRG-SSD-SAM-990PRO-2TB",
    "FRG-GPU-MSI-4070S-V2X",
    "FRG-PSU-CR-RM850E",
    "FRG-CASE-FD-NORTH",
    "FRG-COOL-TR-PA120SE",
]


def _clear_transactions() -> None:
    """Remove orders, carts and builds. Active reservations are released first (the database
    refuses to delete them), and ordered builds are returned to draft (they are delete-protected)."""
    db.session.execute(
        update(StockReservation)
        .where(StockReservation.status == ReservationStatus.ACTIVE)
        .values(status=ReservationStatus.RELEASED)
    )
    db.session.execute(delete(PaymentEvent))
    db.session.execute(delete(Payment))
    db.session.execute(delete(Order))  # cascades to items, addresses, reservations, status history
    db.session.execute(update(Build).where(Build.status == BuildStatus.ORDERED).values(status=BuildStatus.DRAFT))
    db.session.execute(delete(Build))
    db.session.execute(delete(Cart))
    db.session.flush()


def _upsert_account(account: DemoAccount) -> User:
    user = db.session.scalar(select(User).where(User.email == account.email))
    if user is None:
        user = User(email=account.email)
        db.session.add(user)
    user.password_hash = hash_password(account.password)
    user.first_name, user.last_name, user.role, user.is_active = (
        account.first_name,
        account.last_name,
        account.role,
        True,
    )
    db.session.flush()
    return user


def _past_order(
    customer: User, admin: User, lines: list[tuple[str, int]], final: OrderStatus, days_ago: int, n: int
) -> Order:
    products = {p.sku: p for p in db.session.scalars(select(Product).where(Product.sku.in_([s for s, _ in lines])))}
    goods = sum(products[sku].price_cents * qty for sku, qty in lines)
    totals = pricing.totals(goods)
    placed = datetime.now(UTC) - timedelta(days=days_ago)

    set_actor(db.session, customer.id)
    order = Order(
        user_id=customer.id,
        currency="NAD",
        subtotal_cents=totals.subtotal_cents,
        tax_cents=totals.tax_cents,
        shipping_cents=totals.shipping_cents,
        total_cents=totals.total_cents,
        created_at=placed,
        updated_at=placed,
        confirmation_sent_at=placed,
    )
    for sku, qty in lines:
        p = products[sku]
        order.items.append(
            OrderItem(
                product_id=p.id,
                sku_snapshot=p.sku,
                name_snapshot=p.name,
                unit_price_cents=p.price_cents,
                quantity=qty,
                line_total_cents=p.price_cents * qty,
            )
        )
    for kind in (AddressType.SHIPPING, AddressType.BILLING):
        order.addresses.append(OrderAddress(type=kind, **ADDRESS))
    db.session.add(order)
    db.session.flush()

    for sku, qty in sorted(lines, key=lambda line: products[line[0]].id):
        db.session.add(
            StockReservation(
                order_id=order.id, product_id=products[sku].id, quantity=qty, expires_at=placed + timedelta(minutes=15)
            )
        )
    payment = Payment(
        order_id=order.id,
        provider_payment_id=f"pi_demo_{n:04d}",
        amount_cents=order.total_cents,
        currency="NAD",
        status=PaymentStatus.SUCCEEDED,
    )
    db.session.add(payment)
    db.session.flush()

    set_actor(db.session, None)  # paid by the payment provider
    db.session.execute(
        update(StockReservation).where(StockReservation.order_id == order.id).values(status=ReservationStatus.COMMITTED)
    )
    order.status = OrderStatus.PAID
    db.session.add(
        PaymentEvent(order_id=order.id, payment_id=payment.id, kind=PaymentEventKind.SUCCEEDED, details={"demo": True})
    )
    db.session.flush()

    set_actor(db.session, admin.id)
    if final is OrderStatus.REFUNDED:
        payment.status = PaymentStatus.REFUNDED
        order.status = OrderStatus.REFUNDED
        db.session.add(
            PaymentEvent(
                order_id=order.id,
                payment_id=payment.id,
                kind=PaymentEventKind.REFUNDED,
                actor_user_id=admin.id,
                details={"demo": True},
            )
        )
        db.session.flush()
    elif final in FULFILMENT_PATH:
        for step in FULFILMENT_PATH[: FULFILMENT_PATH.index(final) + 1]:
            order.status = step
            db.session.flush()
    return order


def _demo_build(customer: User) -> Build:
    build = Build(user_id=customer.id, name="Demo gaming rig")
    for sku in DEMO_BUILD:
        build.items.append(BuildItem.for_product(db.session.scalar(select(Product).where(Product.sku == sku))))
    db.session.add(build)
    db.session.flush()
    build.status = BuildStatus.VALIDATED  # compatible and complete; asserted by tests/test_demo.py
    return build


def reset(seed_path: Path = DEFAULT_SEED) -> dict[str, int]:
    """Reset to the demo state. Idempotent: running it twice leaves the same data."""
    _clear_transactions()
    load_catalog(seed_path)  # upserts products and restores seeded stock (reserved is now zero)
    admin, customer = _upsert_account(ADMIN), _upsert_account(CUSTOMER)
    db.session.execute(delete(Address).where(Address.user_id == customer.id))
    db.session.add(Address(user_id=customer.id, type=AddressType.SHIPPING, is_default=True, **ADDRESS))
    orders = [
        _past_order(customer, admin, lines, final, days, n) for n, (lines, final, days) in enumerate(PAST_ORDERS, 1)
    ]
    _demo_build(customer)
    db.session.commit()
    return {"orders": len(orders), "accounts": 2}
