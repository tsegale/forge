"""A customer's own orders."""

from __future__ import annotations

from flask import request

from ...schemas.cart import ReorderResponse
from ...schemas.orders import OrderDetail, OrderListQuery, OrderPage
from ...security.guards import current_user, require_auth
from ...services import cart as cart_service
from ...services import orders as order_service
from ..spec import api, responses
from . import bp

TAG = "Orders"
SECURITY = {"bearerAuth": []}


@bp.get("/orders")
@require_auth
@api.validate(query=OrderListQuery, resp=responses(401, 422, HTTP_200=OrderPage), tags=[TAG], security=SECURITY)
def list_orders():
    """The user's orders, newest first."""
    return order_service.list_for(current_user(), request.context.query)


@bp.get("/orders/<string:order_number>")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=OrderDetail), tags=[TAG], security=SECURITY)
def get_order(order_number: str):
    """One order with its lines, totals, address, payment status and status history."""
    return order_service.detail(order_service.get_owned(current_user(), order_number))


@bp.post("/orders/<string:order_number>/cancel")
@require_auth
@api.validate(resp=responses(401, 404, 409, HTTP_200=OrderDetail), tags=[TAG], security=SECURITY)
def cancel_order(order_number: str):
    """Cancel an order that is still awaiting payment; its stock is released immediately."""
    return order_service.detail(order_service.cancel(current_user(), order_number))


@bp.post("/orders/<string:order_number>/reorder")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=ReorderResponse), tags=[TAG], security=SECURITY)
def reorder(order_number: str):
    """Add an order's items to the cart (checkout empties the cart, so this is how a customer
    checks out again after an unpaid order's hold expires, or buys the same parts again).
    Products no longer sold are skipped and listed in unavailable_product_ids."""
    order = order_service.get_owned(current_user(), order_number)
    cart = cart_service.get_or_create(current_user(), None)
    unavailable = cart_service.add_order_lines(cart, order)
    view = cart_service.view(cart_service.find(current_user(), None))
    return ReorderResponse(**view.model_dump(), unavailable_product_ids=unavailable)
