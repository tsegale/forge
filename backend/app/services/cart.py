"""Shopping carts for guests (cookie token) and signed-in users, merged at login.

A cart holds no stock: availability is shown live, and stock is only reserved at checkout.
"""

from __future__ import annotations

import uuid

from flask import current_app
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from ..errors import NotFound, ValidationFailed
from ..extensions import db
from ..models import Cart, CartItem, Order, Product, User
from ..schemas.cart import CartLine, CartResponse, Totals
from ..schemas.catalog import Price
from . import pricing
from .catalog import load_products, to_summary

MAX_LINE_QUANTITY = 99  # matches ck_cart_items_quantity_range


def parse_token(raw: str | None) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw) if raw else None
    except ValueError:
        return None  # a garbled cookie is just an empty cart


def find(user: User | None, guest_token: uuid.UUID | None, *, lock: bool = False) -> Cart | None:
    if user is not None:
        stmt = select(Cart).where(Cart.user_id == user.id)
    elif guest_token is not None:
        stmt = select(Cart).where(Cart.guest_token == guest_token)
    else:
        return None
    return db.session.scalar(stmt.with_for_update() if lock else stmt)


def get_or_create(user: User | None, guest_token: uuid.UUID | None) -> Cart:
    """The caller's cart, created on first write. INSERT ... ON CONFLICT DO NOTHING makes two
    concurrent first requests converge on one cart instead of one failing on the unique key."""
    if user is None and guest_token is None:
        guest_token = uuid.uuid4()
    owner = {"user_id": user.id} if user is not None else {"guest_token": guest_token}
    db.session.execute(insert(Cart).values(**owner).on_conflict_do_nothing())
    cart = find(user, guest_token, lock=True)
    assert cart is not None
    return cart


def _active_product(product_id: int) -> Product:
    product = db.session.get(Product, product_id)
    if product is None or not product.is_active:
        raise ValidationFailed(
            "That product is not available.",
            details=[
                {"field": "product_id", "message": "No active product with this id.", "type": "product_unavailable"}
            ],
        )
    return product


def add_item(cart: Cart, product_id: int, quantity: int) -> None:
    """Add units; adding a product already in the cart increases that line atomically, and
    brings it back from "saved for later". Going past 99 trips ck_cart_items_quantity_range (422)."""
    _active_product(product_id)
    stmt = insert(CartItem).values(cart_id=cart.id, product_id=product_id, quantity=quantity)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_cart_items_cart_product",
        set_={
            "quantity": CartItem.quantity + stmt.excluded.quantity,
            "saved_for_later": False,
            "updated_at": func.now(),
        },
    )
    db.session.execute(stmt)
    db.session.commit()


def _owned_line(cart: Cart | None, item_id: int) -> CartItem:
    line = db.session.get(CartItem, item_id) if cart is not None else None
    if line is None or line.cart_id != cart.id:
        raise NotFound("Cart item not found.")
    return line


def update_item(cart: Cart | None, item_id: int, quantity: int | None, saved_for_later: bool | None) -> None:
    line = _owned_line(cart, item_id)
    if quantity is not None:
        line.quantity = quantity
    if saved_for_later is not None:
        line.saved_for_later = saved_for_later
    db.session.commit()


def remove_item(cart: Cart | None, item_id: int) -> None:
    db.session.delete(_owned_line(cart, item_id))
    db.session.commit()


def clear(cart: Cart | None) -> None:
    """Empty the cart. Lines saved for later stay saved."""
    if cart is not None:
        db.session.execute(delete(CartItem).where(CartItem.cart_id == cart.id, CartItem.saved_for_later.is_(False)))
        db.session.commit()


def merge_guest_cart(guest_token: uuid.UUID | None, user: User) -> None:
    """At login, move the guest cart's lines into the user's cart (quantities add up, capped at
    99) and delete the guest cart. Both carts are locked, so a merge cannot race a cart edit."""
    if guest_token is None:
        return
    guest = find(None, guest_token, lock=True)
    if guest is None:
        return
    target = get_or_create(user, None)
    for line in db.session.scalars(select(CartItem).where(CartItem.cart_id == guest.id)):
        _add_capped(target, line.product_id, line.quantity, saved_for_later=line.saved_for_later)
    db.session.delete(guest)
    db.session.commit()


def add_order_lines(cart: Cart, order: Order) -> list[int]:
    """Put an order's lines back in the cart, e.g. to check out again after its hold expired.
    Quantities add to lines already there (capped at 99). Products no longer sold are skipped;
    their ids are returned so the caller can say so. One transaction: all lines or none."""
    product_ids = sorted({item.product_id for item in order.items})
    active = set(db.session.scalars(select(Product.id).where(Product.id.in_(product_ids), Product.is_active.is_(True))))
    for item in order.items:
        if item.product_id in active:
            _add_capped(cart, item.product_id, item.quantity)
    db.session.commit()
    return [pid for pid in product_ids if pid not in active]


def _add_capped(cart: Cart, product_id: int, quantity: int, *, saved_for_later: bool = False) -> None:
    """Add units capped at 99. The line stays saved for later only if both copies were saved."""
    stmt = insert(CartItem).values(
        cart_id=cart.id,
        product_id=product_id,
        quantity=min(quantity, MAX_LINE_QUANTITY),
        saved_for_later=saved_for_later,
    )
    db.session.execute(
        stmt.on_conflict_do_update(
            constraint="uq_cart_items_cart_product",
            set_={
                "quantity": func.least(CartItem.quantity + stmt.excluded.quantity, MAX_LINE_QUANTITY),
                "saved_for_later": CartItem.saved_for_later & stmt.excluded.saved_for_later,
                "updated_at": func.now(),
            },
        )
    )


def _price(cents: int) -> Price:
    return Price(amount_cents=cents, currency=current_app.config["STORE_CURRENCY"])


def totals_block(goods_gross_cents: int) -> Totals:
    t = pricing.totals(goods_gross_cents)
    return Totals(
        subtotal=_price(t.subtotal_cents),
        shipping=_price(t.shipping_cents),
        tax=_price(t.tax_cents),
        total=_price(t.total_cents),
    )


def view(cart: Cart | None) -> CartResponse:
    lines = (
        list(db.session.scalars(select(CartItem).where(CartItem.cart_id == cart.id).order_by(CartItem.id)))
        if cart is not None
        else []
    )
    products = load_products([line.product_id for line in lines])

    def to_line(line: CartItem) -> CartLine:
        product = products[line.product_id]
        return CartLine(
            id=line.id,
            quantity=line.quantity,
            line_total=_price(product.price_cents * line.quantity),
            in_stock=product.is_active and product.inventory.quantity_available >= line.quantity,
            product=to_summary(product),
        )

    active = [line for line in lines if not line.saved_for_later]
    goods = sum(products[line.product_id].price_cents * line.quantity for line in active)
    return CartResponse(
        items=[to_line(line) for line in active],
        saved=[to_line(line) for line in lines if line.saved_for_later],
        item_count=sum(line.quantity for line in active),
        totals=totals_block(goods),
    )
