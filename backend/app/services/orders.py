"""Orders: serialisation (shared with checkout and the admin API), listing, and customer cancellation."""

from __future__ import annotations

from flask import current_app
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..errors import Conflict, NotFound
from ..extensions import db
from ..models import Order, OrderStatusHistory, Payment, Product, User
from ..models.enums import AddressType, OrderStatus, ReservationStatus
from ..schemas.cart import Totals
from ..schemas.catalog import Price
from ..schemas.orders import (
    OrderDetail,
    OrderLine,
    OrderListQuery,
    OrderPage,
    OrderResponse,
    OrderSummary,
    ShippingAddress,
    StatusChange,
)
from .cancellation import cancel_intents, cancel_locked_order
from .media import image_response


def _price(cents: int, currency: str) -> Price:
    return Price(amount_cents=cents, currency=currency.lower())


def to_response(order: Order) -> OrderResponse:
    currency = order.currency or current_app.config["STORE_CURRENCY"]
    shipping = next((a for a in order.addresses if a.type is AddressType.SHIPPING), None)
    # Presentation only (kind and photo), in one query; the line itself is the purchase snapshot.
    products = {
        p.id: p for p in db.session.scalars(select(Product).where(Product.id.in_([i.product_id for i in order.items])))
    }
    return OrderResponse(
        order_number=order.order_number,
        status=order.status,
        items=[
            OrderLine(
                product_id=i.product_id,
                sku=i.sku_snapshot,
                name=i.name_snapshot,
                quantity=i.quantity,
                unit_price=_price(i.unit_price_cents, currency),
                line_total=_price(i.line_total_cents, currency),
                kind=products[i.product_id].kind_code,
                image=image_response(products[i.product_id].images[0]) if products[i.product_id].images else None,
            )
            for i in sorted(order.items, key=lambda i: i.id)
        ],
        totals=Totals(
            subtotal=_price(order.subtotal_cents, currency),
            shipping=_price(order.shipping_cents, currency),
            tax=_price(order.tax_cents, currency),
            total=_price(order.total_cents, currency),
        ),
        shipping_address=ShippingAddress.model_validate(shipping) if shipping else None,
        build_id=order.build_id,
        reservation_expires_at=order.reservation_expires_at,
        created_at=order.created_at,
    )


def detail(order: Order) -> OrderDetail:
    history = db.session.scalars(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id).order_by(OrderStatusHistory.id)
    )
    latest = db.session.scalar(
        select(Payment.status).where(Payment.order_id == order.id).order_by(Payment.id.desc()).limit(1)
    )
    return OrderDetail(
        **to_response(order).model_dump(),
        payment_status=latest.value if latest else None,
        history=[StatusChange(from_status=h.from_status, to_status=h.to_status, at=h.changed_at) for h in history],
    )


def summary(order: Order) -> OrderSummary:
    return OrderSummary(
        order_number=order.order_number,
        status=order.status,
        item_count=sum(i.quantity for i in order.items),
        total=_price(order.total_cents, order.currency),
        created_at=order.created_at,
    )


def page_rows(stmt, query: OrderListQuery) -> tuple[list[Order], int | None]:
    """Keyset pagination, newest first, on the order id: one page of orders and the next cursor."""
    if query.status is not None:
        stmt = stmt.where(Order.status == query.status)
    if query.cursor is not None:
        stmt = stmt.where(Order.id < query.cursor)
    rows = db.session.scalars(
        stmt.options(selectinload(Order.items)).order_by(Order.id.desc()).limit(query.limit + 1)
    ).all()
    items = list(rows[: query.limit])
    return items, items[-1].id if len(rows) > query.limit else None


def page(stmt, query: OrderListQuery) -> OrderPage:
    items, next_cursor = page_rows(stmt, query)
    return OrderPage(items=[summary(o) for o in items], next_cursor=next_cursor)


def list_for(user: User, query: OrderListQuery) -> OrderPage:
    return page(select(Order).where(Order.user_id == user.id), query)


def get_owned(user: User, order_number: str, *, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.order_number == order_number, Order.user_id == user.id)
    order = db.session.scalar(stmt.with_for_update() if lock else stmt)
    if order is None:
        raise NotFound("Order not found.")
    return order


def cancel(user: User, order_number: str) -> Order:
    """The customer cancels an unpaid order: stock is released at once, then payment is stopped."""
    order = get_owned(user, order_number, lock=True)
    if order.status is not OrderStatus.PENDING_PAYMENT:
        raise Conflict("Only orders awaiting payment can be cancelled.", code="order_not_cancellable")
    intents = cancel_locked_order(order, reservations_to=ReservationStatus.RELEASED, actor_user_id=user.id)
    number = order.order_number
    db.session.commit()
    cancel_intents(number, intents)
    return order
