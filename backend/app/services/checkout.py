"""Phase one of the two-phase checkout: reserve stock and create the order, in one transaction.

Nothing here talks to the payment provider. The transaction locks the inventory rows (always in
product_id order, so concurrent checkouts cannot deadlock), checks availability, snapshots prices
and the address, and inserts reservations, whose trigger moves the stock (migration 0005). It
commits before any network call; holds are data with an expiry, never long-lived row locks.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from flask import current_app
from sqlalchemy import delete, select

from ..errors import Conflict, NotFound, ValidationFailed
from ..extensions import db
from ..models import (
    Build,
    CartItem,
    Order,
    OrderAddress,
    OrderItem,
    Product,
    StockReservation,
    User,
)
from ..models.enums import AddressType, BuildStatus
from ..schemas.addresses import AddressIn
from ..schemas.orders import BuildSource, CheckoutRequest
from . import addresses as address_service
from . import builds as build_service
from . import cart as cart_service
from . import pricing
from .audit import set_actor
from .stock import lock_inventory


@dataclass(frozen=True, slots=True)
class Line:
    product_id: int
    quantity: int


class InsufficientStock(Conflict):
    code, message = "insufficient_stock", "Some items are no longer available in the requested quantity."


def _lines_from_cart(user: User) -> tuple[list[Line], int | None]:
    cart = cart_service.find(user, None, lock=True)
    rows = (
        list(
            db.session.scalars(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.saved_for_later.is_(False)))
        )
        if cart
        else []
    )
    if not rows:
        raise ValidationFailed(
            "The cart is empty.", details=[{"field": "source", "message": "The cart is empty.", "type": "cart_empty"}]
        )
    return [Line(r.product_id, r.quantity) for r in rows], cart.id


def _lines_from_build(user: User, source: BuildSource) -> tuple[list[Line], Build]:
    build = build_service.get_owned(user, source.build_id, lock=True)
    if build.status is not BuildStatus.VALIDATED:
        # Validated means compatible and complete, and the guard_build_items trigger resets it on any
        # change, so the status is always current; there is no need to re-run the engine here.
        raise Conflict(
            "Validate the build (it must be compatible and complete) before checking it out.",
            code="build_not_validated",
        )
    return [Line(i.product_id, i.quantity) for i in build.items], build


def _shipping_address(user: User, request: CheckoutRequest) -> AddressIn:
    if request.address is not None:
        return request.address
    saved = address_service.get_owned(user, request.address_id)
    return AddressIn.model_validate(saved, from_attributes=True)


def place_order(user: User, request: CheckoutRequest) -> Order:
    """Create a pending_payment order with reserved stock. Commits; raises before committing on
    any problem, leaving nothing behind."""
    build: Build | None = None
    cart_id: int | None = None
    if isinstance(request.source, BuildSource):
        lines, build = _lines_from_build(user, request.source)
    else:
        lines, cart_id = _lines_from_cart(user)
    address = _shipping_address(user, request)

    product_ids = sorted({line.product_id for line in lines})
    products = {p.id: p for p in db.session.scalars(select(Product).where(Product.id.in_(product_ids)))}
    inactive = [pid for pid in product_ids if pid not in products or not products[pid].is_active]
    if inactive:
        raise Conflict(
            "Some items are no longer sold.",
            code="product_unavailable",
            details=[{"product_id": pid} for pid in inactive],
        )

    stock = lock_inventory(product_ids)
    short = [
        {
            "product_id": line.product_id,
            "requested": line.quantity,
            "available": max(stock[line.product_id].quantity_available, 0),
        }
        for line in lines
        if stock[line.product_id].quantity_available < line.quantity
    ]
    if short:
        raise InsufficientStock(details=short)

    goods = sum(products[line.product_id].price_cents * line.quantity for line in lines)
    t = pricing.totals(goods)
    expires_at = datetime.now(UTC) + current_app.config["RESERVATION_TTL"]

    set_actor(db.session, user.id)
    order = Order(
        user_id=user.id,
        build_id=build.id if build else None,
        currency=current_app.config["STORE_CURRENCY"].upper(),
        subtotal_cents=t.subtotal_cents,
        tax_cents=t.tax_cents,
        shipping_cents=t.shipping_cents,
        total_cents=t.total_cents,
        reservation_expires_at=expires_at,
    )
    for line in lines:
        product = products[line.product_id]
        order.items.append(
            OrderItem(
                product_id=product.id,
                sku_snapshot=product.sku,
                name_snapshot=product.name,
                unit_price_cents=product.price_cents,
                quantity=line.quantity,
                line_total_cents=product.price_cents * line.quantity,
            )
        )
    for kind in (AddressType.SHIPPING, AddressType.BILLING):
        order.addresses.append(OrderAddress(type=kind, **address.model_dump()))
    db.session.add(order)
    db.session.flush()

    for line in sorted(lines, key=lambda line: line.product_id):
        db.session.add(
            StockReservation(
                order_id=order.id, product_id=line.product_id, quantity=line.quantity, expires_at=expires_at
            )
        )
    if build is not None:
        build.status = BuildStatus.ORDERED
    if cart_id is not None:
        # The order now holds these lines; anything saved for later stays in the cart.
        db.session.execute(delete(CartItem).where(CartItem.cart_id == cart_id, CartItem.saved_for_later.is_(False)))
    db.session.commit()
    return order


def get_order(user: User, order_number: str) -> Order:
    order = db.session.scalar(select(Order).where(Order.order_number == order_number, Order.user_id == user.id))
    if order is None:
        raise NotFound("Order not found.")
    return order
