"""Demo data: an idempotent reset for presentations.

``flask seed demo`` restores the catalog and its seeded stock, clears transactional data, creates a
known admin and customer, and adds past orders in several states, so every screen has something to
show. Orders are created through the same database rules as real ones: a matching succeeded
payment before 'paid', reservations that turn into sales, and the audited state machine.

DEMO ONLY. The credentials below are published in the README.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select, update

from .cli import DEFAULT_SEED, load_catalog
from .compat import BuildContext, Part, evaluate
from .extensions import db
from .models import (
    Address,
    Build,
    BuildItem,
    Cart,
    ComponentKind,
    Inventory,
    Order,
    OrderAddress,
    OrderItem,
    Payment,
    PaymentEvent,
    PriceHistory,
    Product,
    Review,
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
# Shoppers who review parts. Only the demo customer has paid orders, so only their reviews of what
# they bought carry the verified badge (decided by the database trigger, not set here).
REVIEWERS = [
    DemoAccount("demo-reviewer-1@example.com", "forge-demo-reviewer-2026", "Tomas", "Kandjii", UserRole.CUSTOMER),
    DemoAccount("demo-reviewer-2@example.com", "forge-demo-reviewer-2026", "Selma", "Nghipondoka", UserRole.CUSTOMER),
    DemoAccount("demo-reviewer-3@example.com", "forge-demo-reviewer-2026", "Johan", "van Wyk", UserRole.CUSTOMER),
]

# (reviewer: None for the demo customer, else an index into REVIEWERS), SKU, rating, title, body, days ago
REVIEWS: list[tuple[int | None, str, int, str, str, int]] = [
    (
        None,
        "FRG-CPU-R5-7600X",
        5,
        "Great value for an AM5 start",
        "Plenty of performance for 1440p gaming, and it leaves a clear upgrade path on the same socket.",
        18,
    ),
    (
        None,
        "FRG-SSD-SAM-990PRO-2TB",
        5,
        "Fast and quiet",
        "Installs and game loads are noticeably quicker than my old SATA drive. Bought two, both flawless.",
        2,
    ),
    (
        None,
        "FRG-GPU-NV-5070-FE",
        4,
        "Compact and well built",
        "Runs everything I play at high settings. The fans are audible under full load, but the card is small.",
        5,
    ),
    (
        None,
        "FRG-COOL-TR-PA120SE",
        5,
        "Best cooler for the money",
        "Keeps temperatures in check and stays quiet. Check the memory height clearance before you buy.",
        1,
    ),
    (
        0,
        "FRG-CPU-R7-7800X3D",
        5,
        "The gaming chip to get",
        "Smooth frame times in every game I tried. It runs warm under all-core loads, so pair it with a good cooler.",
        40,
    ),
    (
        1,
        "FRG-CPU-R7-7800X3D",
        4,
        "Excellent, but pricey",
        "Very fast in games, less so for video exports than chips with more cores. Worth it if gaming comes first.",
        25,
    ),
    (
        2,
        "FRG-CPU-R7-7800X3D",
        5,
        "A big step up from AM4",
        "A large jump over my previous processor. Remember to enable EXPO for the memory after the first boot.",
        12,
    ),
    (
        0,
        "FRG-MB-MSI-B650-TOMAHAWK",
        5,
        "Solid board, sensible layout",
        "Clear BIOS, plenty of fan headers and a generous set of rear USB ports. Easy to build into.",
        33,
    ),
    (
        1,
        "FRG-GPU-MSI-4070S-V2X",
        4,
        "Quiet at 1440p",
        "Very quiet while gaming, and the length fit my mid tower with room to spare.",
        20,
    ),
    (
        2,
        "FRG-RAM-CR-VEN-32-6000",
        4,
        "Runs at its rated speed",
        "Ran at 6000 MT/s with EXPO enabled. The first boot took a while for memory training, which is normal.",
        9,
    ),
    (
        1,
        "FRG-CASE-FD-NORTH",
        5,
        "Looks great on a desk",
        "The wood front panel is beautiful and airflow is good. Space behind the motherboard tray is a little tight.",
        15,
    ),
    (
        0,
        "FRG-PSU-CR-RM850E",
        3,
        "Fine, with faint coil whine",
        "Stable, with a quiet fan, but mine has faint coil whine under load. The cables are easy to route.",
        7,
    ),
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

# Home-page builds: (share slug, name, blurb, SKUs). Each must pass the engine (compatible and
# complete) or the reset fails; tests/test_demo.py checks the same.
FEATURED_BUILDS: list[tuple[str, str, str, list[str]]] = [
    (
        "featured-1440p-gaming",
        "1440p gaming",
        "High refresh 1440p on a mid tower, with room to grow. The demo build.",
        DEMO_BUILD,
    ),
    (
        "featured-compact-sff",
        "Compact small form factor",
        "A 9800X3D and RX 7800 XT in a 20-litre case, on an SFX supply.",
        [
            "FRG-CPU-R7-9800X3D",
            "FRG-MB-ASUS-B650E-I",
            "FRG-RAM-GS-TZ5-32-6000",
            "FRG-SSD-WD-SN850X-1TB",
            "FRG-GPU-SAP-7800XT-PULSE",
            "FRG-PSU-CR-SF750",
            "FRG-CASE-CM-NR200P",
            "FRG-COOL-NZ-KRAKEN240",
        ],
    ),
    (
        "featured-creator-workstation",
        "Creator workstation",
        "16 cores, 64 GB and an RTX 4080 SUPER for editing, rendering and play.",
        [
            "FRG-CPU-R9-7950X",
            "FRG-MB-ASUS-X670E-E",
            "FRG-RAM-CR-VEN-64-6000",
            "FRG-SSD-SAM-990PRO-2TB",
            "FRG-HDD-SEA-BC-2TB",
            "FRG-GPU-ASUS-4080S-TUF",
            "FRG-PSU-CR-RM1000X",
            "FRG-CASE-LL-O11EVO",
            "FRG-COOL-AR-LF3-360",
        ],
    ),
]

# Restocked during the reset, so "Back in stock" has something to show.
RESTOCKED = ["FRG-GPU-SAP-7800XT-PULSE", "FRG-CASE-FD-NORTH", "FRG-COOL-NZ-KRAKEN240"]


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


def _price_history(now: datetime) -> int:
    """Replace every product's price history with six months of plausible, deterministic changes
    ending at its current price. About a third of products get a recent drop (for "price drops").
    Rows are inserted with past timestamps; the trigger only logs changes made from now on."""
    products = db.session.scalars(select(Product).order_by(Product.sku)).all()
    db.session.execute(delete(PriceHistory))
    for months_ago in range(7):
        db.session.execute(select(func.ensure_price_history_partition((now - timedelta(days=31 * months_ago)).date())))
    for product in products:
        rng = random.Random(product.sku)  # same history on every reset
        current = product.price_cents
        drop = rng.random() < 0.35
        last_change = rng.randint(3, 12) if drop else rng.randint(20, 70)
        steps = sorted(rng.sample(range(last_change + 8, 180), rng.randint(1, 3)), reverse=True)
        rows = [(180, _price_near(current, rng.uniform(1.02, 1.16)))]
        rows += [(days, _price_near(current, rng.uniform(0.98, 1.14))) for days in steps]
        if drop:  # the price just before the latest change was clearly higher
            rows.append((last_change + 1, _price_near(current, rng.uniform(1.06, 1.14))))
        rows.append((last_change, current))
        for days, cents in rows:
            db.session.add(
                PriceHistory(product_id=product.id, price_cents=cents, recorded_at=now - timedelta(days=days))
            )
    db.session.flush()
    return len(products)


def _price_near(cents: int, factor: float) -> int:
    """A shelf price near ``cents * factor``, ending in 99.00 like the seed prices."""
    return max(round(cents * factor / 10_000) * 10_000 - 100, 900)


def _reviews(customer: User, now: datetime) -> int:
    reviewers = [_upsert_account(account) for account in REVIEWERS]
    authors = [customer, *reviewers]
    db.session.execute(delete(Review).where(Review.user_id.in_([u.id for u in authors])))
    for who, sku, rating, title, body, days in REVIEWS:
        user = customer if who is None else reviewers[who]
        product_id = db.session.scalar(select(Product.id).where(Product.sku == sku))
        when = now - timedelta(days=days, hours=who or 0)
        db.session.add(
            Review(
                product_id=product_id,
                user_id=user.id,
                rating=rating,
                title=title,
                body=body,
                created_at=when,
                updated_at=when,
            )
        )
    db.session.flush()
    return len(REVIEWS)


def _featured_builds(owner: User) -> int:
    """The store's own builds, public and featured, validated by the engine itself."""
    required = list(db.session.scalars(select(ComponentKind.code).where(ComponentKind.required_in_build)))
    for slug, name, blurb, skus in FEATURED_BUILDS:
        build = Build(
            user_id=owner.id, name=name, is_public=True, share_slug=slug, is_featured=True, featured_blurb=blurb
        )
        products = [db.session.scalar(select(Product).where(Product.sku == sku)) for sku in skus]
        for product in products:
            build.items.append(BuildItem.for_product(product))
        db.session.add(build)
        db.session.flush()
        report = evaluate(BuildContext(Part(p) for p in products), required)
        if not (report.compatible and report.complete):
            problems = [f.code for f in report.conflicts] + report.missing_kinds
            raise RuntimeError(f"Featured build {slug!r} does not validate: {problems}")
        build.status = BuildStatus.VALIDATED
    return len(FEATURED_BUILDS)


def _restock() -> None:
    """Take a few parts to zero and back, so the inventory trigger records a restock."""
    for sku in RESTOCKED:
        product_id = db.session.scalar(select(Product.id).where(Product.sku == sku))
        inventory = db.session.get(Inventory, product_id)
        on_hand = inventory.quantity_on_hand
        db.session.execute(update(Inventory).where(Inventory.product_id == product_id).values(quantity_on_hand=0))
        db.session.execute(update(Inventory).where(Inventory.product_id == product_id).values(quantity_on_hand=on_hand))
        db.session.expire(inventory)
    db.session.flush()


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
    featured = _featured_builds(admin)
    _restock()
    now = datetime.now(UTC)
    _price_history(now)
    reviews = _reviews(customer, now)  # after the past orders, so the trigger can verify purchases
    db.session.commit()
    return {"orders": len(orders), "accounts": 2 + len(REVIEWERS), "reviews": reviews, "featured": featured}
