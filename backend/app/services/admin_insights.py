"""Back-office reads: sales metrics, the webhook ledger, and one audit trail over every log.

All of it comes from data the database already keeps for its own reasons: orders and their
lines, the trigger-written order_status_history, inventory_events and price_history, the
append-only payment_events, and the webhook idempotency ledger. Nothing is tracked twice.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from flask import current_app
from sqlalchemy import func, select, text

from ..extensions import db
from ..models import (
    Inventory,
    InventoryEvent,
    Order,
    OrderItem,
    OrderStatusHistory,
    PaymentEvent,
    PriceHistory,
    ProcessedWebhookEvent,
    Product,
    User,
)
from ..models.enums import OrderStatus
from ..schemas.admin_insights import (
    AuditEntry,
    AuditKind,
    DailySales,
    LowStock,
    Metrics,
    StatusCount,
    TopProduct,
    WebhookEntry,
)
from ..schemas.catalog import Price
from .notifications import format_money

LOW_STOCK = 3  # matches the storefront's "only N left" threshold
SOLD = (OrderStatus.PAID, OrderStatus.FULFILLING, OrderStatus.SHIPPED, OrderStatus.DELIVERED)

# One row per calendar day of the window in the store's time zone, zero-filled.
DAILY_SQL = text(
    """
    SELECT d::date AS day, coalesce(sum(o.total_cents), 0) AS revenue, count(o.id) AS orders
    FROM generate_series(
        (now() AT TIME ZONE :tz)::date - (:days - 1), (now() AT TIME ZONE :tz)::date, interval '1 day'
    ) AS d
    LEFT JOIN orders o
        ON (o.created_at AT TIME ZONE :tz)::date = d::date AND o.status = ANY(CAST(:sold AS order_status[]))
    GROUP BY d
    ORDER BY d
    """
)


def _price(cents: int) -> Price:
    return Price(amount_cents=int(cents), currency=current_app.config["STORE_CURRENCY"])


def _window_start(days: int) -> Any:
    """Midnight at the start of the window, in the store's time zone, as a timestamptz."""
    tz = current_app.config["STORE_TIMEZONE"]
    midnight = func.date_trunc("day", func.timezone(tz, func.now())) - func.make_interval(0, 0, 0, days - 1)
    return func.timezone(tz, midnight)


def metrics(days: int) -> Metrics:
    since = _window_start(days)
    in_window = Order.created_at >= since
    revenue, orders = db.session.execute(
        select(func.coalesce(func.sum(Order.total_cents), 0), func.count(Order.id)).where(
            in_window, Order.status.in_(SOLD)
        )
    ).one()
    units = db.session.scalar(
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id)
        .where(in_window, Order.status.in_(SOLD))
    )
    refunded = db.session.scalar(
        select(func.coalesce(func.sum(Order.total_cents), 0)).where(in_window, Order.status == OrderStatus.REFUNDED)
    )
    awaiting = db.session.scalar(select(func.count()).where(Order.status == OrderStatus.PENDING_PAYMENT))
    daily = db.session.execute(
        DAILY_SQL,
        {"tz": current_app.config["STORE_TIMEZONE"], "days": days, "sold": [s.value for s in SOLD]},
    ).all()
    by_status = db.session.execute(
        select(Order.status, func.count()).where(in_window).group_by(Order.status).order_by(func.count().desc())
    ).all()
    available = Inventory.quantity_on_hand - Inventory.quantity_reserved
    low = db.session.execute(
        select(Product.id, Product.sku, Product.name, available.label("available"))
        .join(Inventory, Inventory.product_id == Product.id)
        .where(Product.is_active, available <= LOW_STOCK)
        .order_by(available, Product.name)
    ).all()
    line_revenue = func.sum(OrderItem.line_total_cents)
    top = db.session.execute(
        select(OrderItem.product_id, Product.sku, Product.name, func.sum(OrderItem.quantity), line_revenue)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(in_window, Order.status.in_(SOLD))
        .group_by(OrderItem.product_id, Product.sku, Product.name)
        .order_by(line_revenue.desc())
        .limit(5)
    ).all()
    return Metrics(
        days=days,
        revenue=_price(revenue),
        orders=orders,
        average_order=_price(revenue // orders) if orders else None,
        units=units,
        refunded=_price(refunded),
        awaiting_payment=awaiting,
        daily=[DailySales(day=day, revenue=_price(r), orders=n) for day, r, n in daily],
        by_status=[StatusCount(status=status.value, count=n) for status, n in by_status],
        low_stock=[LowStock(product_id=pid, sku=sku, name=name, available=a) for pid, sku, name, a in low],
        top_products=[
            TopProduct(product_id=pid, sku=sku, name=name, units=u, revenue=_price(r)) for pid, sku, name, u, r in top
        ],
    )


def webhooks(limit: int, before: datetime | None) -> tuple[list[WebhookEntry], datetime | None]:
    stmt = select(ProcessedWebhookEvent).order_by(ProcessedWebhookEvent.processed_at.desc())
    if before is not None:
        stmt = stmt.where(ProcessedWebhookEvent.processed_at < before)
    rows = db.session.scalars(stmt.limit(limit + 1)).all()
    page = rows[:limit]
    entries = []
    for row in page:
        metadata = (row.payload.get("data") or {}).get("object", {}).get("metadata") or {}
        entries.append(
            WebhookEntry(
                provider=row.provider,
                event_id=row.event_id,
                event_type=row.event_type,
                processed_at=row.processed_at,
                order_number=metadata.get("order_number"),
            )
        )
    return entries, page[-1].processed_at if len(rows) > limit and page else None


def _names(ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.session.execute(select(User.id, User.first_name, User.last_name).where(User.id.in_(ids))).all()
    return {uid: f"{first} {last}" for uid, first, last in rows}


def audit(kind: AuditKind | None, limit: int, before: datetime | None) -> tuple[list[AuditEntry], datetime | None]:
    """Newest first across the logs. Each source contributes up to ``limit + 1`` rows before the
    cursor; merged and cut to ``limit``, the next cursor is the last entry's time."""
    currency = current_app.config["STORE_CURRENCY"]
    entries: list[tuple[datetime, AuditKind, str, str, int | None, dict[str, Any]]] = []

    def window(column: Any) -> Any:
        return column < before if before is not None else column.is_not(None)

    if kind in (None, "orders"):
        rows = db.session.execute(
            select(OrderStatusHistory, Order.order_number)
            .join(Order, Order.id == OrderStatusHistory.order_id)
            .where(window(OrderStatusHistory.changed_at))
            .order_by(OrderStatusHistory.changed_at.desc())
            .limit(limit + 1)
        ).all()
        for history, number in rows:
            moved = history.from_status.value if history.from_status else "created"
            summary = f"{moved} to {history.to_status.value}".replace("_", " ")
            entries.append(
                (
                    history.changed_at,
                    "orders",
                    number,
                    summary.capitalize(),
                    history.changed_by_user_id,
                    {"from": history.from_status, "to": history.to_status},
                )
            )
    if kind in (None, "stock"):
        rows = db.session.execute(
            select(InventoryEvent, Product.sku)
            .join(Product, Product.id == InventoryEvent.product_id)
            .where(window(InventoryEvent.occurred_at))
            .order_by(InventoryEvent.occurred_at.desc(), InventoryEvent.id.desc())
            .limit(limit + 1)
        ).all()
        for event, sku in rows:
            on_hand = event.on_hand_after - event.on_hand_before
            reserved = event.reserved_after - event.reserved_before
            parts = []
            if on_hand:
                parts.append(f"on hand {event.on_hand_before} to {event.on_hand_after}")
            if reserved:
                parts.append(f"reserved {event.reserved_before} to {event.reserved_after}")
            entries.append(
                (
                    event.occurred_at,
                    "stock",
                    sku,
                    (", ".join(parts) or "recorded").capitalize(),
                    event.actor_id,
                    {"on_hand_change": on_hand, "reserved_change": reserved},
                )
            )
    if kind in (None, "prices"):
        rows = db.session.execute(
            select(PriceHistory.recorded_at, PriceHistory.price_cents, Product.sku)
            .join(Product, Product.id == PriceHistory.product_id)
            .where(window(PriceHistory.recorded_at))
            .order_by(PriceHistory.recorded_at.desc())
            .limit(limit + 1)
        ).all()
        for at, cents, sku in rows:
            entries.append(
                (at, "prices", sku, f"Price set to {format_money(cents, currency)}", None, {"price_cents": cents})
            )
    if kind in (None, "payments"):
        rows = db.session.execute(
            select(PaymentEvent, Order.order_number)
            .join(Order, Order.id == PaymentEvent.order_id)
            .where(window(PaymentEvent.created_at))
            .order_by(PaymentEvent.created_at.desc())
            .limit(limit + 1)
        ).all()
        for event, number in rows:
            summary = f"Payment {event.kind.value.replace('_', ' ')}"
            entries.append((event.created_at, "payments", number, summary, event.actor_user_id, dict(event.details)))

    entries.sort(key=lambda e: e[0], reverse=True)
    page = entries[:limit]
    names = _names({e[4] for e in page if e[4] is not None})
    items = [
        AuditEntry(
            kind=k, at=at, subject=subject, summary=summary, actor=names.get(actor) if actor else None, details=d
        )
        for at, k, subject, summary, actor, d in page
    ]
    return items, page[-1][0] if len(entries) > limit and page else None
