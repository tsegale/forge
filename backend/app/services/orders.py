"""Order serialisation shared by checkout, the customer orders API and the admin API."""

from __future__ import annotations

from flask import current_app

from ..models import Order
from ..models.enums import AddressType
from ..schemas.cart import Totals
from ..schemas.catalog import Price
from ..schemas.orders import OrderLine, OrderResponse, ShippingAddress


def _price(cents: int, currency: str) -> Price:
    return Price(amount_cents=cents, currency=currency.lower())


def to_response(order: Order) -> OrderResponse:
    currency = order.currency or current_app.config["STORE_CURRENCY"]
    shipping = next((a for a in order.addresses if a.type is AddressType.SHIPPING), None)
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
